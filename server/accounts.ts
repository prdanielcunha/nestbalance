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
    await requireHouseholdMember(householdId,user.uid,'manage_finance');
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


export async function updateAccountBalance(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const accountId=String(req.body?.accountId||'');
    const balanceMinor=Number(req.body?.balanceMinor);

    await requireHouseholdMember(householdId,user.uid,'manage_finance');
    if(!/^[A-Za-z0-9_-]{6,128}$/.test(accountId)) return error(res,400,'INVALID_ACCOUNT');
    if(!Number.isSafeInteger(balanceMinor)||Math.abs(balanceMinor)>1_000_000_000_000){
      return error(res,400,'INVALID_BALANCE');
    }

    const household=adminDb.collection('households').doc(householdId);
    const accountRef=household.collection('accounts').doc(accountId);
    const auditRef=household.collection('auditEvents').doc();

    let previousBalanceMinor=0;
    await adminDb.runTransaction(async tx=>{
      const snap=await tx.get(accountRef);
      if(!snap.exists) throw Object.assign(new Error('ACCOUNT_NOT_FOUND'),{statusCode:404});
      const data=snap.data()!;
      if(data.status!=='active') throw Object.assign(new Error('ACCOUNT_NOT_ACTIVE'),{statusCode:409});
      if(data.readOnlySync===true||data.source==='open_finance') throw Object.assign(new Error('ACCOUNT_SYNC_READ_ONLY'),{statusCode:409});
      previousBalanceMinor=Number(data.balanceMinor??data.amountMinor??0);

      tx.update(accountRef,{
        balanceMinor,
        amountMinor:balanceMinor,
        balanceAsOf:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        lastBalanceUpdatedBy:user.uid
      });
      tx.create(auditRef,{
        type:'account.balance_updated',
        actorUid:user.uid,
        entityType:'account',
        entityId:accountId,
        previousBalanceMinor,
        balanceMinor,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json({ok:true,accountId,previousBalanceMinor,balanceMinor});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','ACCOUNT_NOT_FOUND','ACCOUNT_NOT_ACTIVE','ACCOUNT_SYNC_READ_ONLY'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'ACCOUNT_BALANCE_UPDATE_FAILED');
  }
}
