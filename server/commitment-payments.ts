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
    dueDay:Number.isInteger(data.dueDay)?data.dueDay:null,
    installment:data.installment&&Number.isInteger(data.installment.current)&&Number.isInteger(data.installment.total)
      ? {current:data.installment.current,total:data.installment.total}
      : null
  };
}

async function paidRecurringIdsForMonth(householdId:string,monthKey:string){
  const snap=await adminDb.collection('households').doc(householdId)
    .collection('commitmentPayments')
    .where('periodKey','==',monthKey)
    .limit(200).get();
  return new Set(
    snap.docs
      .filter(doc=>String(doc.data().status||'paid')!=='reversed')
      .map(doc=>String(doc.data().commitmentId||''))
      .filter(Boolean)
  );
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
      .filter(item=>!paidIds.has(item.id));

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
        status:'paid',
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        schemaVersion:1
      });

      const installment=fresh.installment&&Number.isInteger(fresh.installment.current)&&Number.isInteger(fresh.installment.total)
        ? {current:Number(fresh.installment.current),total:Number(fresh.installment.total)}
        : null;

      if(installment){
        if(installment.current>=installment.total){
          tx.update(commitmentRef,{
            status:'paid',
            paidOn,
            lastPaidPeriodKey:periodKey,
            lastPaidOn:paidOn,
            paymentTransactionId:transactionRef.id,
            updatedAt:FieldValue.serverTimestamp()
          });
        }else{
          tx.update(commitmentRef,{
            installment:{current:installment.current+1,total:installment.total},
            lastPaidPeriodKey:periodKey,
            lastPaidOn:paidOn,
            updatedAt:FieldValue.serverTimestamp()
          });
        }
      }else if(fresh.recurring===true&&fresh.recurrence==='monthly'){
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


export async function findCommitmentPaymentMatchesBatch(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);

    const rawItems=Array.isArray(req.body?.items)?req.body.items.slice(0,80):[];
    const items=rawItems.map((item:any,index:number)=>({
      index:Number.isInteger(item?.index)?Number(item.index):index,
      amountMinor:Number(item?.amountMinor),
      description:safeText(item?.description),
      observedOn:validIso(item?.observedOn)||new Date().toISOString().slice(0,10),
      direction:String(item?.direction||'')
    })).filter((item:any)=>item.direction==='expense'&&Number.isSafeInteger(item.amountMinor)&&item.amountMinor>0);

    if(!items.length) return res.json({ok:true,matches:[]});

    const household=adminDb.collection('households').doc(householdId);
    const commitmentsSnap=await household.collection('commitments').where('status','==','pending').limit(100).get();
    const commitments=commitmentsSnap.docs.map(dto);

    const monthKeys=[...new Set(items.map((item:any)=>periodKeyForDate(item.observedOn)).filter(Boolean))] as string[];
    const paidByMonth=new Map<string,Set<string>>();
    await Promise.all(monthKeys.map(async monthKey=>{
      paidByMonth.set(monthKey,await paidRecurringIdsForMonth(householdId,monthKey));
    }));

    const matches=items.map((item:any)=>{
      const monthKey=periodKeyForDate(item.observedOn);
      const paidIds=monthKey?paidByMonth.get(monthKey)||new Set<string>():new Set<string>();
      const available=commitments.filter(commitment=>!paidIds.has(commitment.id));
      return {
        index:item.index,
        candidates:matchPayableCommitments({
          amountMinor:item.amountMinor,
          description:item.description,
          observedOn:item.observedOn
        },available).map(match=>({
          commitment:match.commitment,
          score:match.score,
          reasons:match.reasons
        }))
      };
    });

    return res.json({ok:true,matches});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PAYMENT_MATCH_FAILED');
  }
}


export async function undoCommitmentPayment(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const commitmentId=String(req.body?.commitmentId||'');
    const periodKey=String(req.body?.periodKey||'');

    await requireHouseholdMember(householdId,user.uid);
    if(!/^[A-Za-z0-9_-]{6,128}$/.test(commitmentId)) return error(res,400,'INVALID_COMMITMENT');
    if(!(periodKey==='once'||/^\d{4}-\d{2}$/.test(periodKey))) return error(res,400,'INVALID_PAYMENT_PERIOD');

    const household=adminDb.collection('households').doc(householdId);
    const commitmentRef=household.collection('commitments').doc(commitmentId);
    const paymentId=hash(`commitment_payment|${commitmentId}|${periodKey}`).slice(0,40);
    const paymentRef=household.collection('commitmentPayments').doc(paymentId);

    const [paymentSnap,commitmentSnap,allPaymentsSnap]=await Promise.all([
      paymentRef.get(),
      commitmentRef.get(),
      household.collection('commitmentPayments').where('commitmentId','==',commitmentId).limit(120).get()
    ]);

    if(!paymentSnap.exists) return error(res,404,'PAYMENT_NOT_FOUND');
    if(!commitmentSnap.exists) return error(res,404,'COMMITMENT_NOT_FOUND');

    const payment=paymentSnap.data()!;
    if(String(payment.status||'paid')==='reversed'){
      return res.json({ok:true,status:'already_reversed',commitmentId,periodKey});
    }

    const laterPayment=allPaymentsSnap.docs.some(doc=>{
      if(doc.id===paymentId) return false;
      const data=doc.data();
      if(String(data.status||'paid')==='reversed') return false;
      const otherPeriod=String(data.periodKey||'');
      if(periodKey==='once') return true;
      return /^\d{4}-\d{2}$/.test(otherPeriod)&&otherPeriod>periodKey;
    });
    if(laterPayment) return error(res,409,'PAYMENT_UNDO_BLOCKED_BY_LATER_PAYMENT');

    const transactionId=String(payment.transactionId||paymentId);
    const transactionRef=household.collection('transactions').doc(transactionId);
    const transactionSnap=await transactionRef.get();
    const transaction=transactionSnap.exists?transactionSnap.data()||{}:{};

    await adminDb.runTransaction(async tx=>{
      const [freshPayment,freshCommitment,freshTransaction]=await Promise.all([
        tx.get(paymentRef),
        tx.get(commitmentRef),
        tx.get(transactionRef)
      ]);
      if(!freshPayment.exists) fail('PAYMENT_NOT_FOUND',404);
      if(!freshCommitment.exists) fail('COMMITMENT_NOT_FOUND',404);
      if(String(freshPayment.data()?.status||'paid')==='reversed') return;

      const fresh=freshCommitment.data()!;
      const paidInstallment=freshTransaction.exists&&freshTransaction.data()?.installment
        ? freshTransaction.data()!.installment
        : transaction.installment||null;

      tx.update(paymentRef,{
        status:'reversed',
        reversedBy:user.uid,
        reversedAt:FieldValue.serverTimestamp()
      });

      if(freshTransaction.exists){
        tx.update(transactionRef,{
          status:'reversed',
          reversedBy:user.uid,
          reversedAt:FieldValue.serverTimestamp()
        });
      }

      if(paidInstallment&&Number.isInteger(paidInstallment.current)&&Number.isInteger(paidInstallment.total)){
        tx.update(commitmentRef,{
          status:'pending',
          installment:{current:Number(paidInstallment.current),total:Number(paidInstallment.total)},
          lastPaidPeriodKey:FieldValue.delete(),
          lastPaidOn:FieldValue.delete(),
          paidOn:FieldValue.delete(),
          paymentTransactionId:FieldValue.delete(),
          updatedAt:FieldValue.serverTimestamp()
        });
      }else if(fresh.recurring===true&&fresh.recurrence==='monthly'){
        tx.update(commitmentRef,{
          lastPaidPeriodKey:FieldValue.delete(),
          lastPaidOn:FieldValue.delete(),
          updatedAt:FieldValue.serverTimestamp()
        });
      }else{
        tx.update(commitmentRef,{
          status:'pending',
          paidOn:FieldValue.delete(),
          paymentTransactionId:FieldValue.delete(),
          updatedAt:FieldValue.serverTimestamp()
        });
      }

      tx.create(household.collection('auditEvents').doc(),{
        type:'commitment.payment_reversed',
        actorUid:user.uid,
        commitmentId,
        periodKey,
        paymentId,
        transactionId,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json({ok:true,status:'reversed',commitmentId,periodKey});
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
      'INVALID_COMMITMENT','INVALID_PAYMENT_PERIOD','PAYMENT_NOT_FOUND',
      'COMMITMENT_NOT_FOUND','PAYMENT_UNDO_BLOCKED_BY_LATER_PAYMENT'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PAYMENT_UNDO_FAILED');
  }
}
