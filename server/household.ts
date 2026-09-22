import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { isAssignableHouseholdRole, normalizeHouseholdRole } from '../src/core/household.js';
import { normalizeLocale, parseLocale } from '../src/core/locale.js';
import { canSeeHouseholdActivity } from '../src/core/activity.js';
import { normalizeProactivityPreferences } from '../src/core/proactivity.js';

const INVITE_TTL_MS=7*24*60*60*1000;

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}
function fail(code:string,statusCode:number):never{
  throw Object.assign(new Error(code),{statusCode});
}
function normalizeEmail(value:unknown){
  const email=String(value||'').normalize('NFKC').trim().toLowerCase();
  if(!email) return null;
  if(email.length>240||!/^\S+@\S+\.\S+$/.test(email)) fail('INVALID_INVITE_EMAIL',400);
  return email;
}
function cleanName(value:unknown){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,60);
}
function hashToken(value:string){
  return createHash('sha256').update(value).digest('hex');
}
function publicMember(doc:any){
  const data=doc.data()||{};
  return {
    uid:doc.id,
    role:normalizeHouseholdRole(data.role),
    displayName:typeof data.displayName==='string'?data.displayName:null,
    email:typeof data.email==='string'?data.email:null,
    photoURL:typeof data.photoURL==='string'?data.photoURL:null,
    joinedAtMs:data.joinedAt?.toMillis?.()??null
  };
}

export async function getHouseholdSettings(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const current=await requireHouseholdMember(householdId,user.uid,'read');
    const householdRef=adminDb.doc(`households/${householdId}`);
    const [household,members,activitySnap]=await Promise.all([
      householdRef.get(),
      householdRef.collection('members').limit(50).get(),
      householdRef.collection('auditEvents').orderBy('createdAt','desc').limit(40).get()
    ]);
    if(!household.exists) return error(res,404,'HOUSEHOLD_NOT_FOUND');

    let invites:any[]=[];
    if(current.role==='owner'||current.role==='admin'){
      const inviteSnap=await householdRef.collection('invites').where('status','==','pending').limit(30).get();
      const now=Date.now();
      invites=inviteSnap.docs.map(doc=>{
        const data=doc.data()||{};
        return {
          id:doc.id,
          role:normalizeHouseholdRole(data.role),
          email:typeof data.email==='string'?data.email:null,
          expiresAtMs:Number(data.expiresAtMs||0),
          expired:Number(data.expiresAtMs||0)<=now
        };
      });
    }

    const activity=activitySnap.docs
      .map(doc=>({id:doc.id,data:doc.data()||{}}))
      .filter(item=>canSeeHouseholdActivity(item.data,user.uid))
      .slice(0,20)
      .map(item=>({
        id:item.id,
        type:String(item.data.type||'activity.updated'),
        actorUid:typeof item.data.actorUid==='string'?item.data.actorUid:null,
        targetUid:typeof item.data.targetUid==='string'?item.data.targetUid:null,
        scope:item.data.scope==='personal'?'personal':'household',
        createdAtMs:item.data.createdAt?.toMillis?.()??null
      }));

    const data=household.data()||{};
    return res.json({
      ok:true,
      household:{
        id:household.id,
        name:String(data.name||'Meu Lar'),
        currency:String(data.currency||'BRL'),
        locale:normalizeLocale(data.locale),
        ownerUid:String(data.ownerUid||'')
      },
      currentRole:current.role,
      proactivityPreferences:normalizeProactivityPreferences(current.proactivityPreferences),
      members:members.docs.map(publicMember),
      invites,
      activity
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_SETTINGS_FAILED');
  }
}

export async function renameHousehold(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_household');
    const name=cleanName(req.body?.name);
    if(name.length<2) return error(res,400,'INVALID_HOUSEHOLD_NAME');
    const householdRef=adminDb.doc(`households/${householdId}`);
    await adminDb.runTransaction(async tx=>{
      const household=await tx.get(householdRef);
      if(!household.exists) fail('HOUSEHOLD_NOT_FOUND',404);
      tx.update(householdRef,{name,updatedBy:user.uid,updatedAt:FieldValue.serverTimestamp()});
      tx.create(householdRef.collection('auditEvents').doc(),{
        type:'household.renamed',actorUid:user.uid,name,createdAt:FieldValue.serverTimestamp()
      });
    });
    return res.json({ok:true,name});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED','HOUSEHOLD_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_RENAME_FAILED');
  }
}

export async function updateHouseholdLocale(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_household');
    const locale=parseLocale(req.body?.locale);
    if(!locale) return error(res,400,'INVALID_LOCALE');
    const householdRef=adminDb.doc(`households/${householdId}`);
    await adminDb.runTransaction(async tx=>{
      const household=await tx.get(householdRef);
      if(!household.exists) fail('HOUSEHOLD_NOT_FOUND',404);
      const previous=normalizeLocale(household.data()?.locale);
      if(previous===locale) return;
      tx.update(householdRef,{locale,updatedBy:user.uid,updatedAt:FieldValue.serverTimestamp()});
      tx.create(householdRef.collection('auditEvents').doc(),{
        type:'household.locale_changed',
        actorUid:user.uid,
        locale,
        previousLocale:previous,
        createdAt:FieldValue.serverTimestamp()
      });
    });
    return res.json({ok:true,locale});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED','HOUSEHOLD_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_LOCALE_UPDATE_FAILED');
  }
}

export async function createHouseholdInvite(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_household');
    const role=req.body?.role;
    if(!isAssignableHouseholdRole(role)) return error(res,400,'INVALID_HOUSEHOLD_ROLE');
    const email=normalizeEmail(req.body?.email);
    const secret=randomBytes(32).toString('base64url');
    const inviteId=hashToken(secret);
    const expiresAtMs=Date.now()+INVITE_TTL_MS;
    const ref=adminDb.doc(`households/${householdId}/invites/${inviteId}`);
    await ref.create({
      role,email,status:'pending',createdBy:user.uid,
      createdAt:FieldValue.serverTimestamp(),expiresAtMs,schemaVersion:1
    });
    await adminDb.collection('households').doc(householdId).collection('auditEvents').add({
      type:'household.invite_created',actorUid:user.uid,inviteId,role,email,
      createdAt:FieldValue.serverTimestamp()
    });
    return res.status(201).json({ok:true,token:`${householdId}.${secret}`,role,email,expiresAtMs});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED','INVALID_INVITE_EMAIL'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_INVITE_CREATE_FAILED');
  }
}

export async function acceptHouseholdInvite(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const token=String(req.body?.token||'').trim();
    const split=token.indexOf('.');
    if(split<6) return error(res,400,'INVALID_INVITE_TOKEN');
    const householdId=token.slice(0,split);
    const secret=token.slice(split+1);
    if(!/^[A-Za-z0-9_-]{6,128}$/.test(householdId)||secret.length<20) return error(res,400,'INVALID_INVITE_TOKEN');
    const inviteId=hashToken(secret);
    const householdRef=adminDb.doc(`households/${householdId}`);
    const inviteRef=householdRef.collection('invites').doc(inviteId);
    const memberRef=householdRef.collection('members').doc(user.uid);
    const userHouseholdRef=adminDb.doc(`users/${user.uid}/householdRefs/${householdId}`);
    const userRef=adminDb.doc(`users/${user.uid}`);
    let role='member';

    await adminDb.runTransaction(async tx=>{
      const [household,invite,member]=await Promise.all([
        tx.get(householdRef),tx.get(inviteRef),tx.get(memberRef)
      ]);
      if(!household.exists) fail('HOUSEHOLD_NOT_FOUND',404);
      if(!invite.exists) fail('INVITE_NOT_FOUND',404);
      const data=invite.data()||{};
      if(data.status!=='pending') fail('INVITE_NOT_AVAILABLE',409);
      if(Number(data.expiresAtMs||0)<=Date.now()) fail('INVITE_EXPIRED',410);
      const restrictedEmail=typeof data.email==='string'?data.email:null;
      const userEmail=typeof user.email==='string'?user.email.trim().toLowerCase():'';
      if(restrictedEmail&&restrictedEmail!==userEmail) fail('INVITE_EMAIL_MISMATCH',403);
      role=normalizeHouseholdRole(data.role);
      if(role==='owner') role='member';

      if(!member.exists){
        tx.create(memberRef,{
          userId:user.uid,role,
          displayName:typeof user.name==='string'?user.name.trim().slice(0,120):null,
          email:userEmail||null,
          photoURL:typeof user.picture==='string'&&user.picture.startsWith('https://')?user.picture.slice(0,1000):null,
          joinedAt:FieldValue.serverTimestamp(),invitedBy:data.createdBy||null
        });
      }
      tx.set(userHouseholdRef,{householdId,role,joinedAt:FieldValue.serverTimestamp()},{merge:true});
      tx.set(userRef,{
        activeHouseholdId:householdId,
        displayName:typeof user.name==='string'?user.name.trim().slice(0,120):null,
        email:userEmail||null,
        lastSeenAt:FieldValue.serverTimestamp()
      },{merge:true});
      tx.update(inviteRef,{status:'accepted',acceptedBy:user.uid,acceptedAt:FieldValue.serverTimestamp()});
      tx.create(householdRef.collection('auditEvents').doc(),{
        type:'household.invite_accepted',actorUid:user.uid,inviteId,role,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json({ok:true,householdId,role});
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','INVALID_INVITE_TOKEN','HOUSEHOLD_NOT_FOUND','INVITE_NOT_FOUND',
      'INVITE_NOT_AVAILABLE','INVITE_EXPIRED','INVITE_EMAIL_MISMATCH'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_INVITE_ACCEPT_FAILED');
  }
}

export async function updateHouseholdMemberRole(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const targetUid=String(req.body?.uid||'');
    const role=req.body?.role;
    await requireHouseholdMember(householdId,user.uid,'manage_household');
    if(!targetUid||!isAssignableHouseholdRole(role)) return error(res,400,'INVALID_HOUSEHOLD_ROLE');
    const householdRef=adminDb.doc(`households/${householdId}`);
    const memberRef=householdRef.collection('members').doc(targetUid);
    const userRef=adminDb.doc(`users/${targetUid}/householdRefs/${householdId}`);
    await adminDb.runTransaction(async tx=>{
      const member=await tx.get(memberRef);
      if(!member.exists) fail('MEMBER_NOT_FOUND',404);
      if(normalizeHouseholdRole(member.data()?.role)==='owner') fail('OWNER_ROLE_LOCKED',409);
      tx.update(memberRef,{role,updatedBy:user.uid,updatedAt:FieldValue.serverTimestamp()});
      tx.set(userRef,{role,householdId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      tx.create(householdRef.collection('auditEvents').doc(),{
        type:'household.member_role_changed',actorUid:user.uid,targetUid,role,
        createdAt:FieldValue.serverTimestamp()
      });
    });
    return res.json({ok:true,uid:targetUid,role});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED','MEMBER_NOT_FOUND','OWNER_ROLE_LOCKED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_MEMBER_UPDATE_FAILED');
  }
}

export async function removeHouseholdMember(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const targetUid=String(req.body?.uid||'');
    await requireHouseholdMember(householdId,user.uid,'manage_household');
    if(!targetUid||targetUid===user.uid) return error(res,400,'INVALID_MEMBER_REMOVAL');
    const householdRef=adminDb.doc(`households/${householdId}`);
    const memberRef=householdRef.collection('members').doc(targetUid);
    const userRef=adminDb.doc(`users/${targetUid}/householdRefs/${householdId}`);
    await adminDb.runTransaction(async tx=>{
      const member=await tx.get(memberRef);
      if(!member.exists) fail('MEMBER_NOT_FOUND',404);
      if(normalizeHouseholdRole(member.data()?.role)==='owner') fail('OWNER_ROLE_LOCKED',409);
      tx.delete(memberRef);
      tx.delete(userRef);
      tx.create(householdRef.collection('auditEvents').doc(),{
        type:'household.member_removed',actorUid:user.uid,targetUid,
        createdAt:FieldValue.serverTimestamp()
      });
    });
    return res.json({ok:true,uid:targetUid});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED','MEMBER_NOT_FOUND','OWNER_ROLE_LOCKED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_MEMBER_REMOVE_FAILED');
  }
}

export async function revokeHouseholdInvite(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const inviteId=String(req.body?.inviteId||'');
    await requireHouseholdMember(householdId,user.uid,'manage_household');
    if(!/^[a-f0-9]{64}$/.test(inviteId)) return error(res,400,'INVALID_INVITE');

    const householdRef=adminDb.doc(`households/${householdId}`);
    const inviteRef=householdRef.collection('invites').doc(inviteId);
    await adminDb.runTransaction(async tx=>{
      const invite=await tx.get(inviteRef);
      if(!invite.exists) fail('INVITE_NOT_FOUND',404);
      const data=invite.data()||{};
      if(data.status==='revoked') return;
      if(data.status!=='pending') fail('INVITE_NOT_AVAILABLE',409);
      tx.update(inviteRef,{
        status:'revoked',
        revokedBy:user.uid,
        revokedAt:FieldValue.serverTimestamp()
      });
      tx.create(householdRef.collection('auditEvents').doc(),{
        type:'household.invite_revoked',
        actorUid:user.uid,
        inviteId,
        createdAt:FieldValue.serverTimestamp()
      });
    });
    return res.json({ok:true,inviteId,status:'revoked'});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED','INVITE_NOT_FOUND','INVITE_NOT_AVAILABLE'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_INVITE_REVOKE_FAILED');
  }
}
