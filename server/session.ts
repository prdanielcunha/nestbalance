import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { normalizeHouseholdRole } from '../src/core/household.js';
import { normalizeLocale } from '../src/core/locale.js';
import { touchSecurityDevice } from './security.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function primaryHouseholdId(uid:string){
  return `h_${createHash('sha256').update(uid).digest('hex').slice(0,28)}`;
}

function publicProfile(user:any){
  return {
    displayName: typeof user.name === 'string' && user.name.trim() ? user.name.trim().slice(0,120) : null,
    email: typeof user.email === 'string' && user.email.trim() ? user.email.trim().toLowerCase().slice(0,240) : null,
    photoURL: typeof user.picture === 'string' && user.picture.startsWith('https://') ? user.picture.slice(0,1000) : null
  };
}

async function householdOptions(uid:string){
  const refs=await adminDb.collection('users').doc(uid).collection('householdRefs').limit(20).get();
  if(refs.empty) return [];
  const householdRefs=refs.docs.map(doc=>adminDb.doc(`households/${doc.id}`));
  const householdDocs=await adminDb.getAll(...householdRefs);
  const byId=new Map(householdDocs.filter(doc=>doc.exists).map(doc=>[doc.id,doc.data()||{}]));
  return refs.docs
    .map(doc=>{
      const household=byId.get(doc.id);
      if(!household) return null;
      return {
        id:doc.id,
        name:String(household.name||'Meu Lar'),
        role:normalizeHouseholdRole(doc.data()?.role),
        locale:normalizeLocale(household.locale),
        currency:String(household.currency||'BRL')
      };
    })
    .filter((value): value is {id:string;name:string;role:ReturnType<typeof normalizeHouseholdRole>;locale:ReturnType<typeof normalizeLocale>;currency:string}=>Boolean(value));
}

async function touchMemberProfile(householdId:string,uid:string,user:any){
  await adminDb.doc(`households/${householdId}/members/${uid}`).set({
    userId:uid,
    ...publicProfile(user),
    lastSeenAt:FieldValue.serverTimestamp()
  },{merge:true});
}

export async function bootstrapSession(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    let households=await householdOptions(user.uid);
    const userRef=adminDb.doc(`users/${user.uid}`);
    const userSnap=await userRef.get();

    if(households.length){
      const requested=String(req.body?.householdId||'');
      const stored=String(userSnap.data()?.activeHouseholdId||'');
      const selected=households.find(item=>item.id===requested)
        ||households.find(item=>item.id===stored)
        ||households[0];
      await touchMemberProfile(selected.id,user.uid,user);
      await userRef.set({
        activeHouseholdId:selected.id,
        ...publicProfile(user),
        lastSeenAt:FieldValue.serverTimestamp()
      },{merge:true});
      const deviceState=await touchSecurityDevice(user.uid,req.body?.device);
      return res.json({ok:true,householdId:selected.id,households,locale:selected.locale,currency:selected.currency,created:false,deviceFirstSeen:deviceState.firstSeen});
    }

    const householdId=primaryHouseholdId(user.uid);
    const householdRef=adminDb.doc(`households/${householdId}`);
    const memberRef=householdRef.collection('members').doc(user.uid);
    const userHouseholdRef=adminDb.doc(`users/${user.uid}/householdRefs/${householdId}`);
    let created=false;

    await adminDb.runTransaction(async tx=>{
      const [household,member,userHousehold]=await Promise.all([
        tx.get(householdRef),
        tx.get(memberRef),
        tx.get(userHouseholdRef)
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
        tx.set(memberRef,{
          role:'owner',
          userId:user.uid,
          ...publicProfile(user),
          joinedAt:FieldValue.serverTimestamp(),
          lastSeenAt:FieldValue.serverTimestamp()
        });
      }
      if(!userHousehold.exists){
        tx.set(userHouseholdRef,{role:'owner',householdId,createdAt:FieldValue.serverTimestamp()});
      }
      tx.set(userRef,{
        activeHouseholdId:householdId,
        ...publicProfile(user),
        lastSeenAt:FieldValue.serverTimestamp()
      },{merge:true});
    });

    households=await householdOptions(user.uid);
    const selected=households.find(item=>item.id===householdId)||households[0];
    const deviceState=await touchSecurityDevice(user.uid,req.body?.device);
    return res.status(created?201:200).json({ok:true,householdId,households,locale:selected?.locale||'pt-BR',currency:selected?.currency||'BRL',created,deviceFirstSeen:deviceState.firstSeen});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD'];
    if(!safe.includes(err?.message)){
      console.error('NestBalance session bootstrap failed',{
        code:typeof err?.code==='string'?err.code:'unknown',
        name:typeof err?.name==='string'?err.name:'Error'
      });
    }
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SESSION_BOOTSTRAP_FAILED');
  }
}

export async function selectHousehold(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    await adminDb.doc(`users/${user.uid}`).set({
      activeHouseholdId:householdId,
      lastSeenAt:FieldValue.serverTimestamp()
    },{merge:true});
    const households=await householdOptions(user.uid);
    const selected=households.find(item=>item.id===householdId);
    return res.json({ok:true,householdId,households,locale:selected?.locale||'pt-BR',currency:selected?.currency||'BRL'});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_SELECT_FAILED');
  }
}
