import type { Request, Response } from 'express';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

/**
 * Lightweight household change token.
 *
 * Financial mutations already write household audit events. Reusing the newest
 * audited event avoids another Firestore write for every change while giving
 * clients a cheap, private revision they can poll.
 */
export async function getHouseholdRevision(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');

    const latest=await adminDb
      .collection('households').doc(householdId)
      .collection('auditEvents')
      .orderBy('createdAt','desc')
      .limit(1)
      .get();

    const doc=latest.docs[0]||null;
    const createdAtMs=doc?.data()?.createdAt?.toMillis?.()??null;
    const revision=doc?String(createdAtMs??0)+':'+doc.id:'initial';

    return res.json({ok:true,revision,changedAtMs:createdAtMs});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_REVISION_FAILED');
  }
}
