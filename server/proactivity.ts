import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { parseProactivityPreferences } from '../src/core/proactivity.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

export async function updateProactivityPreferences(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const preferences=parseProactivityPreferences(req.body?.preferences);
    if(!preferences) return error(res,400,'INVALID_PROACTIVITY_PREFERENCES');

    const householdRef=adminDb.collection('households').doc(householdId);
    const memberRef=householdRef.collection('members').doc(user.uid);
    const auditRef=householdRef.collection('auditEvents').doc();

    await adminDb.runTransaction(async tx=>{
      const member=await tx.get(memberRef);
      if(!member.exists) throw Object.assign(new Error('HOUSEHOLD_ACCESS_DENIED'),{statusCode:403});
      tx.update(memberRef,{
        proactivityPreferences:preferences,
        proactivityPreferencesUpdatedAt:FieldValue.serverTimestamp()
      });
      tx.create(auditRef,{
        type:'member.proactivity_preferences_updated',
        scope:'personal',
        actorUid:user.uid,
        targetUid:user.uid,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json({ok:true,preferences});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PROACTIVITY_PREFERENCES_UPDATE_FAILED');
  }
}
