import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

const BETA_CONSENT_VERSION='nestbalance-family-beta-v1';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function weekKey(now=new Date()){
  const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const day=date.getUTCDay()||7;
  date.setUTCDate(date.getUTCDate()-day+1);
  return date.toISOString().slice(0,10);
}

export async function getBetaStatus(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const ref=adminDb.collection('betaParticipants').doc(user.uid);
    const snap=await ref.get();
    const data=snap.data()||{};
    return res.json({
      ok:true,
      enrolled:snap.exists&&data.active===true,
      consentVersion:snap.exists?String(data.consentVersion||''):BETA_CONSENT_VERSION,
      enrolledAt:snap.exists?data.enrolledAt?.toDate?.()?.toISOString?.()??null:null
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'BETA_STATUS_FAILED');
  }
}

export async function enrollBeta(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    if(req.body?.researchConsent!==true) return error(res,400,'BETA_CONSENT_REQUIRED');
    const ref=adminDb.collection('betaParticipants').doc(user.uid);
    await ref.set({
      active:true,
      householdId,
      consentVersion:BETA_CONSENT_VERSION,
      consentedToUsageMeasurement:true,
      enrolledAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    return res.status(201).json({ok:true,enrolled:true,consentVersion:BETA_CONSENT_VERSION});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'BETA_ENROLL_FAILED');
  }
}

export async function pulseBeta(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const participant=adminDb.collection('betaParticipants').doc(user.uid);
    const snap=await participant.get();
    if(!snap.exists||snap.data()?.active!==true||snap.data()?.consentedToUsageMeasurement!==true){
      return res.json({ok:true,recorded:false});
    }
    const key=weekKey();
    await participant.collection('weeks').doc(key).set({
      weekKey:key,
      seenAt:FieldValue.serverTimestamp()
    },{merge:true});
    return res.json({ok:true,recorded:true,weekKey:key});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'BETA_PULSE_FAILED');
  }
}
