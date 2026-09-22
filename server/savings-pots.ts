import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertScopedAccess, requestedScope } from './privacy.js';
import { normalizeSavingsPotName } from '../src/core/savings-pots.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function cleanName(value:unknown,max=80){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,max);
}

function validMinor(value:unknown,{allowZero=true}:{allowZero?:boolean}={}){
  const amount=Number(value);
  if(!Number.isSafeInteger(amount)||amount<0||amount>1_000_000_000_000) return null;
  if(!allowZero&&amount===0) return null;
  return amount;
}

function validPotId(value:string){
  return /^[A-Za-z0-9_-]{6,128}$/.test(value);
}

export async function upsertSavingsPot(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');

    const name=cleanName(req.body?.name);
    if(name.length<2) return error(res,400,'INVALID_SAVINGS_POT_NAME');

    const balanceMinor=validMinor(req.body?.balanceMinor);
    if(balanceMinor===null) return error(res,400,'INVALID_SAVINGS_POT_BALANCE');

    const rawGoal=req.body?.goalMinor;
    const goalMinor=rawGoal===null||rawGoal===undefined||rawGoal===''?null:validMinor(rawGoal,{allowZero:false});
    if(rawGoal!==null&&rawGoal!==undefined&&rawGoal!==''&&goalMinor===null){
      return error(res,400,'INVALID_SAVINGS_POT_GOAL');
    }

    const institutionName=cleanName(req.body?.institutionName,80)||null;
    const household=adminDb.collection('households').doc(householdId);
    const requestedPotId=String(req.body?.potId||'');

    let ref;
    let created=false;
    let scope:'household'|'personal';
    let ownerUid:string|null;
    let source='manual';

    if(requestedPotId){
      if(!validPotId(requestedPotId)) return error(res,400,'INVALID_SAVINGS_POT_ID');
      ref=household.collection('savingsPots').doc(requestedPotId);
      const snap=await ref.get();
      if(!snap.exists) return error(res,404,'SAVINGS_POT_NOT_FOUND');
      const existing=snap.data()!;
      assertScopedAccess(existing,user.uid);
      source=typeof existing.source==='string'&&existing.source?existing.source:'manual';
      scope=existing.scope==='personal'?'personal':'household';
      ownerUid=scope==='personal'?user.uid:null;
    }else{
      scope=requestedScope(req.body?.scope);
      ownerUid=scope==='personal'?user.uid:null;
      const stableKey=institutionName
        ? createHash('sha256').update([
            scope,
            ownerUid||'',
            'screen_pot',
            normalizeSavingsPotName(institutionName),
            normalizeSavingsPotName(name)
          ].join('|')).digest('hex').slice(0,40)
        : null;
      ref=stableKey?household.collection('savingsPots').doc(stableKey):household.collection('savingsPots').doc();
      const existing=stableKey?await ref.get():null;
      if(existing?.exists){
        const data=existing.data()!;
        assertScopedAccess(data,user.uid);
        source=typeof data.source==='string'&&data.source?data.source:'manual';
        created=false;
      }else{
        created=true;
      }
    }

    const payload={
      name,
      balanceMinor,
      amountMinor:balanceMinor,
      goalMinor,
      currency:'BRL',
      institutionName,
      scope,
      ownerUid,
      status:'active',
      source,
      manuallyAdjusted:!created,
      updatedAt:FieldValue.serverTimestamp(),
      importedBy:user.uid,
      schemaVersion:2,
      ...(created?{createdAt:FieldValue.serverTimestamp()}: {})
    };

    await ref.set(payload,{merge:true});
    await household.collection('auditEvents').add({
      type:created?'savings_pot.created':'savings_pot.updated',
      actorUid:user.uid,
      savingsPotId:ref.id,
      scope,
      ownerUid,
      balanceMinor,
      goalMinor,
      institutionName,
      createdAt:FieldValue.serverTimestamp()
    });

    return res.status(created?201:200).json({ok:true,potId:ref.id,created});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_UPSERT_FAILED');
  }
}
