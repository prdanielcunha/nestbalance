import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { isSpendingCategory, recurringPatternKey } from '../src/core/insights.js';
import { normalizeFinancialScope } from '../src/core/privacy.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertScopedAccess } from './privacy.js';
import { categoryRuleDocId } from './category-rules.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function safeId(value:unknown){
  const id=String(value||'');
  return /^[A-Za-z0-9_-]{6,128}$/.test(id)?id:null;
}

export async function updateTransactionCategory(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const transactionId=safeId(req.body?.transactionId);
    const category=req.body?.category;
    const rememberForSimilar=req.body?.rememberForSimilar===true;
    if(!transactionId) return error(res,400,'INVALID_TRANSACTION');
    if(!isSpendingCategory(category)) return error(res,400,'INVALID_CATEGORY');

    await requireHouseholdMember(householdId,user.uid,'contribute');
    const household=adminDb.collection('households').doc(householdId);
    const transactionRef=household.collection('transactions').doc(transactionId);
    const snap=await transactionRef.get();
    if(!snap.exists) return error(res,404,'TRANSACTION_NOT_FOUND');

    const data=assertScopedAccess(snap.data(),user.uid);
    if(data.direction!=='expense'||data.status==='cancelled'||data.source==='credit_card_invoice_payment'){
      return error(res,409,'TRANSACTION_NOT_CATEGORIZABLE');
    }

    const scope=normalizeFinancialScope(data.scope);
    const ownerUid=scope==='personal'?user.uid:null;
    const patternKey=recurringPatternKey(String(data.description||''));
    const auditRef=household.collection('auditEvents').doc();
    const batch=adminDb.batch();

    batch.update(transactionRef,{
      category,
      categorySource:'user',
      categoryUpdatedBy:user.uid,
      categoryUpdatedAt:FieldValue.serverTimestamp()
    });

    if(rememberForSimilar&&patternKey.length>=3){
      const ruleRef=household.collection('categoryRules').doc(categoryRuleDocId(scope,ownerUid,patternKey));
      batch.set(ruleRef,{
        patternKey,
        category,
        scope,
        ownerUid,
        updatedBy:user.uid,
        updatedAt:FieldValue.serverTimestamp()
      },{merge:true});
    }

    batch.create(auditRef,{
      type:'transaction.category_updated',
      scope,
      actorUid:user.uid,
      entityType:'transaction',
      entityId:transactionId,
      category,
      rememberForSimilar,
      patternKey:rememberForSimilar?patternKey:null,
      createdAt:FieldValue.serverTimestamp()
    });

    await batch.commit();
    return res.json({ok:true,transactionId,category,rememberForSimilar});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'CATEGORY_UPDATE_FAILED');
  }
}
