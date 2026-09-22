import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { signatureMatchesMime } from '../src/core/evidence.js';
import { normalizeSavingsPotAutomation, automationContributionMinor, frequencyOccurrenceDates, type SavingsPotAutomation } from '../src/core/savings-pot-automation.js';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertScopedAccess, requestedScope } from './privacy.js';
import { canAccessScopedRecord } from '../src/core/privacy.js';
import { normalizeSavingsPotName } from '../src/core/savings-pots.js';

const MAX_COVER_BYTES=5*1024*1024;
const COVER_MIMES=new Set(['image/jpeg','image/png','image/webp']);

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function cleanName(value:unknown,max=80){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,max);
}

function cleanNote(value:unknown,max=280){
  return String(value||'').normalize('NFKC').replace(/[\t\r]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,max);
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

function validDate(value:unknown){
  const text=String(value||'').trim();
  if(!text) return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const [y,m,d]=text.split('-').map(Number);
  const date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d) return undefined;
  return text;
}

function dayKey(value=new Date()){
  return value.toISOString().slice(0,10);
}

function hash(value:string){
  return createHash('sha256').update(value).digest('hex');
}

function activityPayload(args:{
  potId:string;
  type:string;
  amountMinor:number;
  resultingBalanceMinor:number;
  scope:'household'|'personal';
  ownerUid:string|null;
  actorUid:string;
  note?:string|null;
  source?:string|null;
  triggerKey?:string|null;
}){
  return {
    savingsPotId:args.potId,
    type:args.type,
    amountMinor:args.amountMinor,
    resultingBalanceMinor:args.resultingBalanceMinor,
    currency:'BRL',
    scope:args.scope,
    ownerUid:args.ownerUid,
    actorUid:args.actorUid,
    note:args.note||null,
    source:args.source||'manual',
    triggerKey:args.triggerKey||null,
    createdAt:FieldValue.serverTimestamp()
  };
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

    const targetDate=validDate(req.body?.targetDate);
    if(targetDate===undefined) return error(res,400,'INVALID_SAVINGS_POT_TARGET_DATE');
    const note=cleanNote(req.body?.note)||null;
    const institutionName=cleanName(req.body?.institutionName,80)||null;
    const household=adminDb.collection('households').doc(householdId);
    const requestedPotId=String(req.body?.potId||'');

    let ref;
    let created=false;
    let scope:'household'|'personal';
    let ownerUid:string|null;
    let source='manual';
    let previousBalanceMinor=0;

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
      previousBalanceMinor=Number(existing.balanceMinor||0);
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

      let matchingExisting:FirebaseFirestore.QueryDocumentSnapshot|null=null;
      if(institutionName){
        const candidates=await household.collection('savingsPots').where('status','==','active').limit(200).get();
        matchingExisting=candidates.docs.find(doc=>{
          const data=doc.data();
          const existingScope=data.scope==='personal'?'personal':'household';
          const existingOwner=existingScope==='personal'?String(data.ownerUid||''):'';
          return existingScope===scope
            &&(scope!=='personal'||existingOwner===user.uid)
            &&normalizeSavingsPotName(String(data.institutionName||''))===normalizeSavingsPotName(institutionName)
            &&normalizeSavingsPotName(String(data.name||''))===normalizeSavingsPotName(name);
        })??null;
      }

      if(matchingExisting){
        ref=matchingExisting.ref;
        const data=matchingExisting.data();
        assertScopedAccess(data,user.uid);
        source=typeof data.source==='string'&&data.source?data.source:'manual';
        previousBalanceMinor=Number(data.balanceMinor||0);
        created=false;
      }else{
        ref=stableKey?household.collection('savingsPots').doc(stableKey):household.collection('savingsPots').doc();
        const existing=stableKey?await ref.get():null;
        if(existing?.exists){
          const data=existing.data()!;
          assertScopedAccess(data,user.uid);
          source=typeof data.source==='string'&&data.source?data.source:'manual';
          previousBalanceMinor=Number(data.balanceMinor||0);
          created=false;
        }else{
          created=true;
        }
      }
    }

    const payload={
      name,
      balanceMinor,
      amountMinor:balanceMinor,
      goalMinor,
      targetDate,
      note,
      currency:'BRL',
      institutionName,
      normalizedName:normalizeSavingsPotName(name),
      normalizedInstitution:normalizeSavingsPotName(institutionName||''),
      scope,
      ownerUid,
      status:'active',
      source,
      trackingMode:source==='screen_import'?'bank_mirror':'manual',
      manuallyAdjusted:!created,
      updatedAt:FieldValue.serverTimestamp(),
      importedBy:user.uid,
      schemaVersion:3,
      ...(created?{createdAt:FieldValue.serverTimestamp()}: {})
    };

    await adminDb.runTransaction(async tx=>{
      tx.set(ref,payload,{merge:true});
      const delta=balanceMinor-previousBalanceMinor;
      if(created||delta!==0){
        const activity=household.collection('savingsPotActivities').doc();
        tx.create(activity,activityPayload({
          potId:ref.id,
          type:created?'created':'balance_adjustment',
          amountMinor:Math.abs(delta),
          resultingBalanceMinor:balanceMinor,
          scope,
          ownerUid,
          actorUid:user.uid,
          source:'manual'
        }));
      }
      const audit=household.collection('auditEvents').doc();
      tx.create(audit,{
        type:created?'savings_pot.created':'savings_pot.updated',
        actorUid:user.uid,
        savingsPotId:ref.id,
        scope,
        ownerUid,
        balanceMinor,
        goalMinor,
        targetDate,
        institutionName,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.status(created?201:200).json({ok:true,potId:ref.id,created});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_UPSERT_FAILED');
  }
}

export async function moveSavingsPot(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const potId=String(req.body?.potId||'');
    const direction=req.body?.direction==='withdraw'?'withdraw':req.body?.direction==='reserve'?'reserve':null;
    const amountMinor=validMinor(req.body?.amountMinor,{allowZero:false});
    const note=cleanNote(req.body?.note,160)||null;
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!validPotId(potId)) return error(res,400,'INVALID_SAVINGS_POT_ID');
    if(!direction) return error(res,400,'INVALID_SAVINGS_POT_DIRECTION');
    if(amountMinor===null) return error(res,400,'INVALID_SAVINGS_POT_AMOUNT');

    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('savingsPots').doc(potId);
    let resultingBalanceMinor=0;

    await adminDb.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) throw Object.assign(new Error('SAVINGS_POT_NOT_FOUND'),{statusCode:404});
      const data=snap.data()!;
      assertScopedAccess(data,user.uid);
      if(String(data.status||'active')!=='active') throw Object.assign(new Error('SAVINGS_POT_NOT_ACTIVE'),{statusCode:409});
      const current=Math.max(0,Number(data.balanceMinor||0));
      resultingBalanceMinor=direction==='reserve'?current+amountMinor:current-amountMinor;
      if(resultingBalanceMinor<0) throw Object.assign(new Error('SAVINGS_POT_INSUFFICIENT_BALANCE'),{statusCode:409});
      const scope=data.scope==='personal'?'personal':'household';
      const ownerUid=scope==='personal'?user.uid:null;
      tx.update(ref,{
        balanceMinor:resultingBalanceMinor,
        amountMinor:resultingBalanceMinor,
        manuallyAdjusted:true,
        updatedAt:FieldValue.serverTimestamp()
      });
      tx.create(household.collection('savingsPotActivities').doc(),activityPayload({
        potId,
        type:direction,
        amountMinor,
        resultingBalanceMinor,
        scope,
        ownerUid,
        actorUid:user.uid,
        note,
        source:'manual'
      }));
      tx.create(household.collection('auditEvents').doc(),{
        type:`savings_pot.${direction}`,
        actorUid:user.uid,
        savingsPotId:potId,
        scope,
        ownerUid,
        amountMinor,
        resultingBalanceMinor,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json({ok:true,potId,resultingBalanceMinor});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','SAVINGS_POT_NOT_FOUND','SAVINGS_POT_NOT_ACTIVE','SAVINGS_POT_INSUFFICIENT_BALANCE'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_MOVE_FAILED');
  }
}

export async function updateSavingsPotAutomation(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const potId=String(req.body?.potId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!validPotId(potId)) return error(res,400,'INVALID_SAVINGS_POT_ID');

    const raw=req.body?.automation;
    const automation=raw===null?null:normalizeSavingsPotAutomation(raw);
    if(raw!==null&&!automation) return error(res,400,'INVALID_SAVINGS_POT_AUTOMATION');

    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('savingsPots').doc(potId);
    const snap=await ref.get();
    if(!snap.exists) return error(res,404,'SAVINGS_POT_NOT_FOUND');
    const data=snap.data()!;
    assertScopedAccess(data,user.uid);
    if(String(data.status||'active')!=='active') return error(res,409,'SAVINGS_POT_NOT_ACTIVE');
    if(data.source==='screen_import'&&automation?.enabled) return error(res,409,'BANK_MIRROR_AUTOMATION_UNAVAILABLE');

    const normalized=automation?{
      ...automation,
      anchorDate:automation.anchorDate||dayKey()
    }:null;
    await ref.set({automation:normalized,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    await household.collection('auditEvents').add({
      type:'savings_pot.automation_updated',
      actorUid:user.uid,
      savingsPotId:potId,
      scope:data.scope==='personal'?'personal':'household',
      ownerUid:data.scope==='personal'?user.uid:null,
      automationKind:normalized?.kind||null,
      automationEnabled:normalized?.enabled===true,
      createdAt:FieldValue.serverTimestamp()
    });
    return res.json({ok:true,automation:normalized});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','SAVINGS_POT_NOT_FOUND','SAVINGS_POT_NOT_ACTIVE','BANK_MIRROR_AUTOMATION_UNAVAILABLE'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_AUTOMATION_FAILED');
  }
}

async function applyAutomationEvent(args:{
  household:FirebaseFirestore.DocumentReference;
  potId:string;
  eventKey:string;
  type:string;
  amountMinor:number;
  triggerKey:string;
  actorUid:string;
}){
  if(!Number.isSafeInteger(args.amountMinor)||args.amountMinor<=0) return false;
  const eventId=hash([args.potId,args.type,args.triggerKey].join('|')).slice(0,48);
  const eventRef=args.household.collection('savingsPotAutomationEvents').doc(eventId);
  const potRef=args.household.collection('savingsPots').doc(args.potId);
  let applied=false;

  await adminDb.runTransaction(async tx=>{
    const [eventSnap,potSnap]=await Promise.all([tx.get(eventRef),tx.get(potRef)]);
    if(eventSnap.exists||!potSnap.exists) return;
    const pot=potSnap.data()!;
    if(String(pot.status||'active')!=='active') return;
    const automation=normalizeSavingsPotAutomation(pot.automation);
    if(!automation?.enabled) return;
    const current=Math.max(0,Number(pot.balanceMinor||0));
    const resultingBalanceMinor=current+args.amountMinor;
    const scope=pot.scope==='personal'?'personal':'household';
    const ownerUid=scope==='personal'?String(pot.ownerUid||args.actorUid):null;
    tx.create(eventRef,{
      savingsPotId:args.potId,
      type:args.type,
      triggerKey:args.triggerKey,
      amountMinor:args.amountMinor,
      scope,
      ownerUid,
      createdAt:FieldValue.serverTimestamp()
    });
    tx.update(potRef,{
      balanceMinor:resultingBalanceMinor,
      amountMinor:resultingBalanceMinor,
      updatedAt:FieldValue.serverTimestamp(),
      lastAutomationAt:FieldValue.serverTimestamp()
    });
    tx.create(args.household.collection('savingsPotActivities').doc(),activityPayload({
      potId:args.potId,
      type:'automatic_reserve',
      amountMinor:args.amountMinor,
      resultingBalanceMinor,
      scope,
      ownerUid,
      actorUid:args.actorUid,
      source:'automation',
      triggerKey:args.triggerKey
    }));
    applied=true;
  });
  return applied;
}

export async function syncSavingsPotAutomations(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    const household=adminDb.collection('households').doc(householdId);
    const [potsSnap,transactionsSnap]=await Promise.all([
      household.collection('savingsPots').where('status','==','active').limit(100).get(),
      household.collection('transactions').orderBy('createdAt','desc').limit(200).get()
    ]);
    const pots=potsSnap.docs.filter(doc=>canAccessScopedRecord(doc.data(),user.uid));
    const transactions=transactionsSnap.docs
      .filter(doc=>canAccessScopedRecord(doc.data(),user.uid))
      .map(doc=>({id:doc.id,...doc.data()} as any));

    let applied=0;
    const today=dayKey();
    for(const potDoc of pots){
      const pot=potDoc.data();
      if(pot.source==='screen_import') continue;
      const automation=normalizeSavingsPotAutomation(pot.automation);
      if(!automation?.enabled) continue;

      if(automation.kind==='frequency'){
        for(const occurrence of frequencyOccurrenceDates(automation,today,24)){
          const ok=await applyAutomationEvent({
            household,potId:potDoc.id,eventKey:occurrence,type:'frequency',
            amountMinor:automation.amountMinor||0,triggerKey:occurrence,actorUid:user.uid
          });
          if(ok) applied++;
        }
        continue;
      }

      const anchor=automation.anchorDate||today;
      for(const movement of transactions){
        const observedOn=String(movement.observedOn||'');
        if(observedOn&&observedOn<anchor) continue;
        if(String(movement.status||'confirmed')==='cancelled') continue;
        const direction=String(movement.direction||'expense');
        if(automation.kind==='spend'){
          if(direction!=='expense'||movement.source==='credit_card_invoice_payment') continue;
        }else if(direction!=='income'){
          continue;
        }
        const amount=automationContributionMinor(automation,Math.max(0,Number(movement.amountMinor||0)));
        const ok=await applyAutomationEvent({
          household,potId:potDoc.id,eventKey:movement.id,type:automation.kind,
          amountMinor:amount,triggerKey:movement.id,actorUid:user.uid
        });
        if(ok) applied++;
        if(applied>=80) break;
      }
      if(applied>=80) break;
    }

    return res.json({ok:true,applied});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_AUTOMATION_SYNC_FAILED');
  }
}

export async function getSavingsPotDetail(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const potId=String(req.body?.potId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    if(!validPotId(potId)) return error(res,400,'INVALID_SAVINGS_POT_ID');
    const household=adminDb.collection('households').doc(householdId);
    const potSnap=await household.collection('savingsPots').doc(potId).get();
    if(!potSnap.exists) return error(res,404,'SAVINGS_POT_NOT_FOUND');
    const pot=potSnap.data()!;
    assertScopedAccess(pot,user.uid);

    const activitySnap=await household.collection('savingsPotActivities').where('savingsPotId','==',potId).limit(100).get();
    const activities=activitySnap.docs
      .filter(doc=>canAccessScopedRecord(doc.data(),user.uid))
      .map(doc=>{
        const data=doc.data();
        return {
          id:doc.id,
          type:String(data.type||'activity'),
          amountMinor:Number(data.amountMinor||0),
          resultingBalanceMinor:Number(data.resultingBalanceMinor||0),
          note:typeof data.note==='string'?data.note:null,
          source:typeof data.source==='string'?data.source:null,
          createdAtMs:data.createdAt?.toMillis?.()??0
        };
      })
      .sort((a,b)=>b.createdAtMs-a.createdAtMs)
      .slice(0,50);

    return res.json({ok:true,potId,activities});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','SAVINGS_POT_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_DETAIL_FAILED');
  }
}

export async function archiveSavingsPot(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const potId=String(req.body?.potId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!validPotId(potId)) return error(res,400,'INVALID_SAVINGS_POT_ID');
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('savingsPots').doc(potId);
    const snap=await ref.get();
    if(!snap.exists) return error(res,404,'SAVINGS_POT_NOT_FOUND');
    const data=snap.data()!;
    assertScopedAccess(data,user.uid);
    if(Number(data.balanceMinor||0)!==0) return error(res,409,'SAVINGS_POT_NOT_EMPTY');
    await ref.set({status:'archived',automation:null,updatedAt:FieldValue.serverTimestamp(),archivedAt:FieldValue.serverTimestamp()},{merge:true});
    await household.collection('auditEvents').add({
      type:'savings_pot.archived',actorUid:user.uid,savingsPotId:potId,
      scope:data.scope==='personal'?'personal':'household',ownerUid:data.scope==='personal'?user.uid:null,
      createdAt:FieldValue.serverTimestamp()
    });
    return res.json({ok:true,potId});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','SAVINGS_POT_NOT_FOUND','SAVINGS_POT_NOT_EMPTY'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_ARCHIVE_FAILED');
  }
}

export async function uploadSavingsPotCover(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.header('x-nestbalance-household-id')||'');
    const potId=String(req.header('x-nestbalance-savings-pot-id')||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!validPotId(potId)) return error(res,400,'INVALID_SAVINGS_POT_ID');

    const mimeType=String(req.header('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!COVER_MIMES.has(mimeType)) return error(res,400,'UNSUPPORTED_SAVINGS_POT_COVER');
    const bytes=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
    if(!bytes.length||bytes.length>MAX_COVER_BYTES) return error(res,400,'INVALID_SAVINGS_POT_COVER_SIZE');
    if(!signatureMatchesMime(mimeType,new Uint8Array(bytes.subarray(0,4096)))) return error(res,400,'INVALID_SAVINGS_POT_COVER_SIGNATURE');

    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('savingsPots').doc(potId);
    const snap=await ref.get();
    if(!snap.exists) return error(res,404,'SAVINGS_POT_NOT_FOUND');
    const data=snap.data()!;
    assertScopedAccess(data,user.uid);
    const path=`nestbalance/households/${householdId}/savings-pots/${potId}/cover`;
    await adminBucket.file(path).save(bytes,{
      resumable:false,
      validation:false,
      metadata:{
        contentType:mimeType,
        cacheControl:'private,no-store',
        metadata:{householdId,potId,uploaderUid:user.uid}
      }
    });
    const coverVersion=Date.now();
    await ref.set({
      hasCover:true,
      coverMimeType:mimeType,
      coverStoragePath:path,
      coverVersion,
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    return res.json({ok:true,potId,coverVersion});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','SAVINGS_POT_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_COVER_UPLOAD_FAILED');
  }
}

export async function previewSavingsPotCover(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const potId=String(req.body?.potId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    if(!validPotId(potId)) return error(res,400,'INVALID_SAVINGS_POT_ID');
    const ref=adminDb.collection('households').doc(householdId).collection('savingsPots').doc(potId);
    const snap=await ref.get();
    if(!snap.exists) return error(res,404,'SAVINGS_POT_NOT_FOUND');
    const data=snap.data()!;
    assertScopedAccess(data,user.uid);
    const path=String(data.coverStoragePath||'');
    const mimeType=String(data.coverMimeType||'');
    if(!data.hasCover||!path||!COVER_MIMES.has(mimeType)) return error(res,404,'SAVINGS_POT_COVER_NOT_FOUND');
    const [bytes]=await adminBucket.file(path).download();
    if(bytes.length>MAX_COVER_BYTES||!signatureMatchesMime(mimeType,new Uint8Array(bytes.subarray(0,4096)))) return error(res,409,'SAVINGS_POT_COVER_INVALID');
    res.setHeader('Content-Type',mimeType);
    res.setHeader('Content-Length',String(bytes.length));
    return res.status(200).send(bytes);
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','SAVINGS_POT_NOT_FOUND','SAVINGS_POT_COVER_NOT_FOUND','SAVINGS_POT_COVER_INVALID'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_COVER_PREVIEW_FAILED');
  }
}

export async function deleteSavingsPotCover(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const potId=String(req.body?.potId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!validPotId(potId)) return error(res,400,'INVALID_SAVINGS_POT_ID');
    const ref=adminDb.collection('households').doc(householdId).collection('savingsPots').doc(potId);
    const snap=await ref.get();
    if(!snap.exists) return error(res,404,'SAVINGS_POT_NOT_FOUND');
    const data=snap.data()!;
    assertScopedAccess(data,user.uid);
    const path=String(data.coverStoragePath||'');
    if(path) await adminBucket.file(path).delete({ignoreNotFound:true}).catch(()=>undefined);
    await ref.set({
      hasCover:false,
      coverMimeType:FieldValue.delete(),
      coverStoragePath:FieldValue.delete(),
      coverVersion:FieldValue.delete(),
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    return res.json({ok:true,potId});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','SAVINGS_POT_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SAVINGS_POT_COVER_DELETE_FAILED');
  }
}
