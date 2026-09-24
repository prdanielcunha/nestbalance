import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { validateAccountDraft } from '../src/core/accounts.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertScopedAccess, scopeFields } from './privacy.js';

function error(res:Response,status:number,code:string,extra:Record<string,unknown>={}){
  return res.status(status).json({ok:false,error:code,...extra});
}

function timestampMillis(value:any){
  if(value&&typeof value.toMillis==='function') return Number(value.toMillis())||0;
  if(value instanceof Date) return value.getTime();
  if(typeof value==='number') return Number.isFinite(value)?value:0;
  return 0;
}

export async function createAccount(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_finance');
    const privacy=scopeFields(req.body?.scope,user.uid);
    const validated=validateAccountDraft({
      name:req.body?.name,
      type:req.body?.type,
      balanceMinor:req.body?.balanceMinor
    });
    if(!validated.ok) return error(res,400,validated.reason);

    const keyHash=createHash('sha256').update(privacy.scope+'|'+(privacy.ownerUid||'')+'|'+validated.dedupKey).digest('hex');
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
        scope:privacy.scope,
        ownerUid:privacy.ownerUid,
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
        scope:privacy.scope,
        ownerUid:privacy.ownerUid,
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
    const expectedUpdatedAtMs=Number(req.body?.expectedUpdatedAtMs||0);

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
      assertScopedAccess(data,user.uid);
      if(data.status!=='active') throw Object.assign(new Error('ACCOUNT_NOT_ACTIVE'),{statusCode:409});
      const wasLegacySync=data.readOnlySync===true||data.source==='open_finance';
      previousBalanceMinor=Number(data.balanceMinor??data.amountMinor??0);
      const currentUpdatedAtMs=timestampMillis(data.updatedAt||data.balanceAsOf||data.createdAt);
      if(Number.isSafeInteger(expectedUpdatedAtMs)&&expectedUpdatedAtMs>0&&currentUpdatedAtMs!==expectedUpdatedAtMs){
        throw Object.assign(new Error('ACCOUNT_BALANCE_CONFLICT'),{
          statusCode:409,
          currentBalanceMinor:previousBalanceMinor,
          currentUpdatedAtMs
        });
      }

      tx.update(accountRef,{
        balanceMinor,
        amountMinor:balanceMinor,
        balanceAsOf:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        lastBalanceUpdatedBy:user.uid,
        ...(wasLegacySync?{
          source:'manual',
          readOnlySync:false,
          connectionId:FieldValue.delete(),
          externalAccountId:FieldValue.delete(),
          provider:FieldValue.delete()
        }: {})
      });
      tx.create(auditRef,{
        type:'account.balance_updated',
        scope:data.scope==='personal'?'personal':'household',
        ownerUid:data.scope==='personal'?user.uid:null,
        actorUid:user.uid,
        entityType:'account',
        entityId:accountId,
        previousBalanceMinor,
        balanceMinor,
        convertedFromLegacySync:data.readOnlySync===true||data.source==='open_finance',
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json({ok:true,accountId,previousBalanceMinor,balanceMinor});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','ACCOUNT_NOT_FOUND','ACCOUNT_NOT_ACTIVE','ACCOUNT_BALANCE_CONFLICT'];
    if(err?.message==='ACCOUNT_BALANCE_CONFLICT'){
      return error(res,409,'ACCOUNT_BALANCE_CONFLICT',{
        currentBalanceMinor:Number(err.currentBalanceMinor)||0,
        currentUpdatedAtMs:Number(err.currentUpdatedAtMs)||0
      });
    }
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'ACCOUNT_BALANCE_UPDATE_FAILED');
  }
}
