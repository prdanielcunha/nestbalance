import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { normalizeHomePreferences } from '../src/core/home-preferences.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

export async function updateHomePreferences(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const preferences=normalizeHomePreferences(req.body?.preferences);
    const household=adminDb.collection('households').doc(householdId);
    const memberRef=household.collection('members').doc(user.uid);
    const auditRef=household.collection('auditEvents').doc();

    await adminDb.runTransaction(async tx=>{
      tx.set(memberRef,{homePreferences:preferences,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      tx.create(auditRef,{
        type:'member.home_preferences_updated',
        actorUid:user.uid,
        entityType:'member_preferences',
        entityId:user.uid,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json({ok:true,preferences});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOME_PREFERENCES_UPDATE_FAILED');
  }
}
