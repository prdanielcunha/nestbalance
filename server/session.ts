import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function primaryHouseholdId(uid:string){
  return `h_${createHash('sha256').update(uid).digest('hex').slice(0,28)}`;
}

export async function bootstrapSession(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const refs=await adminDb.collection('users').doc(user.uid).collection('householdRefs').limit(1).get();
    if(!refs.empty){
      return res.json({ok:true,householdId:refs.docs[0].id,created:false});
    }

    const householdId=primaryHouseholdId(user.uid);
    const householdRef=adminDb.doc(`households/${householdId}`);
    const memberRef=householdRef.collection('members').doc(user.uid);
    const userRef=adminDb.doc(`users/${user.uid}/householdRefs/${householdId}`);
    let created=false;

    await adminDb.runTransaction(async tx=>{
      const [household,member,userHousehold]=await Promise.all([
        tx.get(householdRef),
        tx.get(memberRef),
        tx.get(userRef)
      ]);
      if(!household.exists){
        const displayName=typeof user.name==='string'&&user.name.trim()?user.name.trim().split(/\s+/)[0]:null;
        tx.create(householdRef,{
          ownerUid:user.uid,
          name:displayName?`Casa de ${displayName}`:'Minha casa',
          currency:'BRL',
          locale:'pt-BR',
          createdAt:FieldValue.serverTimestamp(),
          schemaVersion:1
        });
        created=true;
      }
      if(!member.exists){
        tx.set(memberRef,{role:'owner',userId:user.uid,joinedAt:FieldValue.serverTimestamp()});
      }
      if(!userHousehold.exists){
        tx.set(userRef,{role:'owner',householdId,createdAt:FieldValue.serverTimestamp()});
      }
    });

    return res.status(created?201:200).json({ok:true,householdId,created});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SESSION_BOOTSTRAP_FAILED');
  }
}
