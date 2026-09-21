import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  commitmentPaymentPeriod,
  matchPayableCommitments,
  periodKeyForDate,
  type PayableCommitment
} from '../src/core/commitment-payments.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function fail(code:string,statusCode:number):never{
  throw Object.assign(new Error(code),{statusCode});
}

function validIso(value:unknown){
  const raw=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year,month,day]=raw.split('-').map(Number);
  const parsed=new Date(year,month-1,day);
  return parsed.getFullYear()===year&&parsed.getMonth()===month-1&&parsed.getDate()===day?raw:null;
}

function safeText(value:unknown,max=120){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,max);
}

function hash(value:string){
  return createHash('sha256').update(value).digest('hex');
}

function dto(doc:any):PayableCommitment{
  const data=doc.data();
  return {
    id:doc.id,
    description:String(data.description||'Conta'),
    amountMinor:Number(data.amountMinor||0),
    status:String(data.status||'pending'),
    recurring:Boolean(data.recurring),
    recurrence:data.recurrence||null,
    dueDay:Number.isInteger(data.dueDay)?data.dueDay:null
  };
}

async function paidRecurringIdsForMonth(householdId:string,monthKey:string){
  const snap=await adminDb.collection('households').doc(householdId)
    .collection('commitmentPayments')
    .where('periodKey','==',monthKey)
    .limit(200).get();
  return new Set(snap.docs.map(doc=>String(doc.data().commitmentId||'')).filter(Boolean));
}

export async function findCommitmentPaymentMatches(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);

    const amountMinor=Number(req.body?.amountMinor);
    if(!Number.isSafeInteger(amountMinor)||amountMinor<=0) return error(res,400,'INVALID_PAYMENT_AMOUNT');

    const observedOn=validIso(req.body?.observedOn)||new Date().toISOString().slice(0,10);
    const monthKey=periodKeyForDate(observedOn);
    if(!monthKey) return error(res,400,'INVALID_PAYMENT_DATE');

    const household=adminDb.collection('households').doc(householdId);
    const [commitmentsSnap,paidIds]=await Promise.all([
      household.collection('commitments').where('status','==','pending').limit(100).get(),
      paidRecurringIdsForMonth(householdId,monthKey)
    ]);

    const commitments=commitmentsSnap.docs
      .map(dto)
      .filter(item=>!(item.recurring===true&&item.recurrence==='monthly'&&paidIds.has(item.id)));

    const matches=matchPayableCommitments({
      amountMinor,
      description:safeText(req.body?.description),
      observedOn
    },commitments);

    return res.json({
      ok:true,
      observedOn,
      matches:matches.map(item=>({
        commitment:item.commitment,
        score:item.score,
        reasons:item.reasons
      }))
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PAYMENT_MATCH_FAILED');
  }
}

export async function payCommitment(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const commitmentId=String(req.body?.commitmentId||'');
    const paidOn=validIso(req.body?.paidOn)||new Date().toISOString().slice(0,10);
    const evidenceId=req.body?.evidenceId?String(req.body.evidenceId):null;

    await requireHouseholdMember(householdId,user.uid);
    if(!/^[A-Za-z0-9_-]{6,128}$/.test(commitmentId)) return error(res,400,'INVALID_COMMITMENT');

    const household=adminDb.collection('households').doc(householdId);
    const commitmentRef=household.collection('commitments').doc(commitmentId);
    const commitmentSnap=await commitmentRef.get();
    if(!commitmentSnap.exists) return error(res,404,'COMMITMENT_NOT_FOUND');

    const commitment=dto(commitmentSnap);
    if(commitment.status==='cancelled') return error(res,409,'COMMITMENT_CANCELLED');
    if(commitment.status==='paid'&&!commitment.recurring) {
      return res.json({ok:true,status:'duplicate',commitmentId});
    }

    const periodKey=commitmentPaymentPeriod(commitment,paidOn);
    if(!periodKey) return error(res,400,'INVALID_PAYMENT_DATE');

    let canonicalEvidenceId:string|null=null;
    if(evidenceId){
      const evidenceSnap=await household.collection('evidenceAssets').doc(evidenceId).get();
      if(!evidenceSnap.exists) return error(res,400,'EVIDENCE_NOT_FOUND');
      const data=evidenceSnap.data()!;
      if(!['accepted','duplicate'].includes(String(data.status||''))) return error(res,409,'EVIDENCE_NOT_READY');
      canonicalEvidenceId=String(data.canonicalEvidenceId||evidenceId);
    }

    const paymentId=hash(`commitment_payment|${commitmentId}|${periodKey}`).slice(0,40);
    const paymentRef=household.collection('commitmentPayments').doc(paymentId);
    const transactionRef=household.collection('transactions').doc(paymentId);
    const auditRef=household.collection('auditEvents').doc();

    const result=await adminDb.runTransaction(async tx=>{
      const existing=await tx.get(paymentRef);
      if(existing.exists){
        return {status:'duplicate' as const,transactionId:String(existing.data()?.transactionId||paymentId)};
      }

      const freshCommitment=await tx.get(commitmentRef);
      if(!freshCommitment.exists) fail('COMMITMENT_NOT_FOUND',404);
      const fresh=freshCommitment.data()!;
      if(fresh.status==='cancelled') fail('COMMITMENT_CANCELLED',409);
      if(fresh.status==='paid'&&!fresh.recurring) {
        return {status:'duplicate' as const,transactionId:String(fresh.paymentTransactionId||'')};
      }

      tx.create(transactionRef,{
        description:String(fresh.description||'Pagamento'),
        amountMinor:Number(fresh.amountMinor||0),
        currency:String(fresh.currency||'BRL'),
        direction:'expense',
        source:'commitment_payment',
        commitmentId,
        commitmentPeriodKey:periodKey,
        evidenceIds:canonicalEvidenceId?[canonicalEvidenceId]:[],
        status:'confirmed',
        observedOn:paidOn,
        recurring:false,
        recurrence:null,
        dueDay:null,
        installment:fresh.installment??null,
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp()
      });

      tx.create(paymentRef,{
        commitmentId,
        periodKey,
        amountMinor:Number(fresh.amountMinor||0),
        currency:String(fresh.currency||'BRL'),
        paidOn,
        transactionId:transactionRef.id,
        evidenceId:canonicalEvidenceId,
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        schemaVersion:1
      });

      if(fresh.recurring===true&&fresh.recurrence==='monthly'){
        tx.update(commitmentRef,{
          lastPaidPeriodKey:periodKey,
          lastPaidOn:paidOn,
          updatedAt:FieldValue.serverTimestamp()
        });
      }else{
        tx.update(commitmentRef,{
          status:'paid',
          paidOn,
          paymentTransactionId:transactionRef.id,
          updatedAt:FieldValue.serverTimestamp()
        });
      }

      tx.create(auditRef,{
        type:'commitment.paid',
        actorUid:user.uid,
        commitmentId,
        periodKey,
        paidOn,
        amountMinor:Number(fresh.amountMinor||0),
        evidenceId:canonicalEvidenceId,
        transactionId:transactionRef.id,
        createdAt:FieldValue.serverTimestamp()
      });

      return {status:'paid' as const,transactionId:transactionRef.id};
    });

    return res.status(result.status==='paid'?201:200).json({
      ok:true,
      ...result,
      commitmentId,
      periodKey,
      paidOn
    });
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
      'INVALID_COMMITMENT','COMMITMENT_NOT_FOUND','COMMITMENT_CANCELLED',
      'INVALID_PAYMENT_DATE','EVIDENCE_NOT_FOUND','EVIDENCE_NOT_READY'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'COMMITMENT_PAYMENT_FAILED');
  }
}
