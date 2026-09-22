import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { deriveRecurringCandidates, recurringPatternKey, type InsightTransaction } from '../src/core/insights.js';
import { normalizeFinancialScope } from '../src/core/privacy.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertScopedAccess, visibleDocs } from './privacy.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function safeId(value:unknown){
  const id=String(value||'');
  return /^[A-Za-z0-9_-]{6,128}$/.test(id)?id:null;
}

function patternDocId(scope:string,ownerUid:string|null,key:string){
  return createHash('sha256')
    .update(`recurrence|${scope}|${ownerUid||''}|${key}`)
    .digest('hex')
    .slice(0,40);
}

function transactionDto(doc:any):InsightTransaction{
  const data=doc.data();
  return {
    id:doc.id,
    description:String(data.description||'Movimento'),
    amountMinor:Number(data.amountMinor||0),
    direction:data.direction||'expense',
    source:typeof data.source==='string'?data.source:null,
    status:String(data.status||'confirmed'),
    observedOn:typeof data.observedOn==='string'?data.observedOn:null
  };
}

function sameScope(data:any,reference:any,userUid:string){
  const scope=normalizeFinancialScope(reference.scope);
  if(normalizeFinancialScope(data?.scope)!==scope) return false;
  if(scope==='personal') return data?.ownerUid===userUid&&reference?.ownerUid===userUid;
  return true;
}

export async function confirmRecurringSuggestion(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const referenceTransactionId=safeId(req.body?.referenceTransactionId);
    if(!referenceTransactionId) return error(res,400,'INVALID_REFERENCE_TRANSACTION');

    await requireHouseholdMember(householdId,user.uid,'contribute');
    const household=adminDb.collection('households').doc(householdId);
    const referenceRef=household.collection('transactions').doc(referenceTransactionId);
    const referenceSnap=await referenceRef.get();
    if(!referenceSnap.exists) return error(res,404,'REFERENCE_TRANSACTION_NOT_FOUND');
    const reference=assertScopedAccess(referenceSnap.data(),user.uid);
    if(reference.direction!=='expense'||reference.status==='cancelled') return error(res,409,'REFERENCE_NOT_ELIGIBLE');

    const key=recurringPatternKey(String(reference.description||''));
    if(key.length<3) return error(res,409,'RECURRENCE_PATTERN_NOT_FOUND');

    const transactionsSnap=await household.collection('transactions').orderBy('createdAt','desc').limit(500).get();
    const eligibleDocs=visibleDocs(transactionsSnap.docs,user.uid).filter(doc=>sameScope(doc.data(),reference,user.uid));
    const candidates=deriveRecurringCandidates(eligibleDocs.map(transactionDto));
    const candidate=candidates.find(item=>item.key===key);
    if(!candidate) return error(res,409,'RECURRENCE_PATTERN_NOT_CONFIRMED');

    const scope=normalizeFinancialScope(reference.scope);
    const ownerUid=scope==='personal'?user.uid:null;
    const docId=patternDocId(scope,ownerUid,key);
    const commitmentRef=household.collection('commitments').doc(docId);
    const dismissalRef=household.collection('recurrenceDismissals').doc(docId);
    const auditRef=household.collection('auditEvents').doc();

    const commitmentsSnap=await household.collection('commitments').where('recurring','==',true).limit(100).get();
    const alreadyExists=visibleDocs(commitmentsSnap.docs,user.uid)
      .filter(doc=>sameScope(doc.data(),reference,user.uid))
      .find(doc=>recurringPatternKey(String(doc.data().description||''))===key);

    if(alreadyExists){
      return res.json({ok:true,status:'existing',commitmentId:alreadyExists.id});
    }

    const existing=await commitmentRef.get();
    if(existing.exists){
      return res.json({ok:true,status:'existing',commitmentId:commitmentRef.id});
    }

    await adminDb.runTransaction(async tx=>{
      const fresh=await tx.get(commitmentRef);
      if(fresh.exists) return;

      tx.create(commitmentRef,{
        description:candidate.description,
        amountMinor:candidate.averageMinor,
        currency:String(reference.currency||'BRL'),
        direction:'expense',
        source:'recurrence_confirmation',
        status:'pending',
        recurring:true,
        recurrence:'monthly',
        dueDay:candidate.suggestedDueDay,
        scope,
        ownerUid,
        confidence:'user_confirmed',
        needsReview:[],
        recurrenceSource:{
          patternKey:key,
          observedMonths:candidate.observedMonths,
          referenceTransactionId,
          confirmedBy:user.uid
        },
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp()
      });

      tx.delete(dismissalRef);
      tx.create(auditRef,{
        type:'recurrence.confirmed',
        scope,
        actorUid:user.uid,
        entityType:'commitment',
        entityId:commitmentRef.id,
        referenceTransactionId,
        observedMonths:candidate.observedMonths,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.status(201).json({
      ok:true,
      status:'created',
      commitmentId:commitmentRef.id,
      suggestion:{
        description:candidate.description,
        amountMinor:candidate.averageMinor,
        dueDay:candidate.suggestedDueDay,
        observedMonths:candidate.observedMonths
      }
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'RECURRENCE_CONFIRM_FAILED');
  }
}

export async function dismissRecurringSuggestion(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const referenceTransactionId=safeId(req.body?.referenceTransactionId);
    if(!referenceTransactionId) return error(res,400,'INVALID_REFERENCE_TRANSACTION');

    await requireHouseholdMember(householdId,user.uid,'contribute');
    const household=adminDb.collection('households').doc(householdId);
    const referenceSnap=await household.collection('transactions').doc(referenceTransactionId).get();
    if(!referenceSnap.exists) return error(res,404,'REFERENCE_TRANSACTION_NOT_FOUND');
    const reference=assertScopedAccess(referenceSnap.data(),user.uid);
    const key=recurringPatternKey(String(reference.description||''));
    if(key.length<3) return error(res,409,'RECURRENCE_PATTERN_NOT_FOUND');

    const scope=normalizeFinancialScope(reference.scope);
    const ownerUid=scope==='personal'?user.uid:null;
    const docId=patternDocId(scope,ownerUid,key);
    await household.collection('recurrenceDismissals').doc(docId).set({
      patternKey:key,
      scope,
      ownerUid,
      referenceTransactionId,
      dismissedBy:user.uid,
      dismissedAt:FieldValue.serverTimestamp()
    },{merge:true});

    await household.collection('auditEvents').add({
      type:'recurrence.dismissed',
      scope,
      actorUid:user.uid,
      entityType:'recurrence_suggestion',
      entityId:docId,
      referenceTransactionId,
      createdAt:FieldValue.serverTimestamp()
    });

    return res.json({ok:true,status:'dismissed',patternKey:key});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'RECURRENCE_DISMISS_FAILED');
  }
}
