import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { validateAccountDraft } from '../src/core/accounts.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

export async function createAccount(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);
    const validated=validateAccountDraft({
      name:req.body?.name,
      type:req.body?.type,
      balanceMinor:req.body?.balanceMinor
    });
    if(!validated.ok) return error(res,400,validated.reason);

    const keyHash=createHash('sha256').update(validated.dedupKey).digest('hex');
    const accountRef=adminDb.collection('households').doc(householdId).collection('accounts').doc();
    const keyRef=adminDb.doc(`households/${householdId}/accountKeys/${keyHash}`);
    const auditRef=adminDb.collection('households').doc(householdId).collection('auditEvents').doc();

    let result:{status:'created'|'existing';id:string}={status:'created',id:accountRef.id};
    await adminDb.runTransaction(async tx=>{
      const existing=await tx.get(keyRef);
      if(existing.exists){
        result={status:'existing',id:String(existing.data()?.accountId||'')};
        return;
      }
      tx.create(accountRef,{
        name:validated.value.name,
        type:validated.value.type,
        balanceMinor:validated.value.balanceMinor,
        amountMinor:validated.value.balanceMinor,
        currency:'BRL',
        scope:'household',
        status:'active',
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        balanceAsOf:FieldValue.serverTimestamp(),
        schemaVersion:1
      });
      tx.create(keyRef,{accountId:accountRef.id,createdAt:FieldValue.serverTimestamp()});
      tx.create(auditRef,{
        type:'account.created',
        actorUid:user.uid,
        entityType:'account',
        entityId:accountRef.id,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.status(result.status==='created'?201:200).json({ok:true,...result});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'ACCOUNT_CREATE_FAILED');
  }
}
