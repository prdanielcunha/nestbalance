import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { attentionDismissalExpiry } from '../src/core/attention.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function cleanKey(value:unknown){
  const key=String(value||'').normalize('NFKC').trim();
  if(key.length<3||key.length>180||!/^[A-Za-z0-9:_\-.]+$/.test(key)) return null;
  if(!['anomaly-','spending-change-','ending-'].some(prefix=>key.startsWith(prefix))) return null;
  return key;
}

export async function dismissAttention(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const attentionKey=cleanKey(req.body?.attentionKey);
    if(!attentionKey) return error(res,400,'INVALID_ATTENTION_KEY');

    await requireHouseholdMember(householdId,user.uid);
    const nowMs=Date.now();
    const snoozeDays=Number(req.body?.snoozeDays||7);
    const expiresAtMs=attentionDismissalExpiry(nowMs,snoozeDays);
    const docId=createHash('sha256').update(user.uid+'|'+attentionKey).digest('hex').slice(0,40);
    const household=adminDb.collection('households').doc(householdId);

    await household.collection('attentionDismissals').doc(docId).set({
      attentionKey,
      userUid:user.uid,
      expiresAtMs,
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});

    await household.collection('auditEvents').add({
      type:'attention.dismissed',
      actorUid:user.uid,
      entityType:'attention',
      entityId:docId,
      attentionKey,
      expiresAtMs,
      createdAt:FieldValue.serverTimestamp()
    });

    return res.json({ok:true,attentionKey,expiresAtMs});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'ATTENTION_DISMISS_FAILED');
  }
}
