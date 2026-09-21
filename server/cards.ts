import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { validateCreditCardDraft } from '../src/core/cards.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { scopeFields } from './privacy.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

export async function createCreditCard(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_finance');

    const privacy=scopeFields(req.body?.scope,user.uid);
    const validated=validateCreditCardDraft({
      name:req.body?.name,
      brand:req.body?.brand,
      closingDay:req.body?.closingDay,
      dueDay:req.body?.dueDay,
      last4:req.body?.last4,
      limitMinor:req.body?.limitMinor
    });
    if(!validated.ok) return error(res,400,validated.reason);

    const keyHash=createHash('sha256').update(privacy.scope+'|'+(privacy.ownerUid||'')+'|'+validated.dedupKey).digest('hex');
    const household=adminDb.collection('households').doc(householdId);
    const cardRef=household.collection('creditCards').doc();
    const keyRef=household.collection('creditCardKeys').doc(keyHash);
    const auditRef=household.collection('auditEvents').doc();

    let result:{status:'created'|'existing';id:string}={status:'created',id:cardRef.id};

    await adminDb.runTransaction(async tx=>{
      const existing=await tx.get(keyRef);
      if(existing.exists){
        result={status:'existing',id:String(existing.data()?.cardId||'')};
        return;
      }

      tx.create(cardRef,{
        name:validated.value.name,
        brand:validated.value.brand,
        closingDay:validated.value.closingDay,
        dueDay:validated.value.dueDay,
        last4:validated.value.last4,
        limitMinor:validated.value.limitMinor,
        currency:'BRL',
        scope:privacy.scope,
        ownerUid:privacy.ownerUid,
        status:'active',
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        schemaVersion:1
      });

      tx.create(keyRef,{
        cardId:cardRef.id,
        createdAt:FieldValue.serverTimestamp()
      });

      tx.create(auditRef,{
        type:'credit_card.created',
        actorUid:user.uid,
        entityType:'credit_card',
        entityId:cardRef.id,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.status(result.status==='created'?201:200).json({ok:true,...result});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'CREDIT_CARD_CREATE_FAILED');
  }
}
