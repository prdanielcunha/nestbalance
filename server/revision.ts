import type { Request, Response } from 'express';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function timestampMillis(value:any){
  if(value&&typeof value.toMillis==='function') return Number(value.toMillis())||0;
  if(value instanceof Date) return value.getTime();
  if(typeof value==='number') return Number.isFinite(value)?value:0;
  return 0;
}

export async function getHouseholdRevision(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);
    const snap=await adminDb.collection('households').doc(householdId)
      .collection('auditEvents')
      .orderBy('createdAt','desc')
      .limit(1)
      .get();
    const latest=snap.docs[0]||null;
    const revision=latest?`${timestampMillis(latest.data()?.createdAt)}:${latest.id}`:'0';
    return res.json({ok:true,revision});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_REVISION_FAILED');
  }
}
