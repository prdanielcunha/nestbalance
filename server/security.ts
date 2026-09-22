import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { invalidateNestBalanceSessionCache, requireFirebaseUser } from './auth.js';
import { normalizeDeviceContext, type DeviceContext } from '../src/core/security.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}
function deviceDocId(id:string){
  return createHash('sha256').update('nestbalance-device-v1|'+id).digest('hex');
}

export async function touchSecurityDevice(uid:string,value:unknown){
  const device=normalizeDeviceContext(value);
  if(!device) return {recorded:false,firstSeen:false};
  const userRef=adminDb.collection('users').doc(uid);
  const deviceRef=userRef.collection('devices').doc(deviceDocId(device.id));
  let firstSeen=false;
  await adminDb.runTransaction(async tx=>{
    const existing=await tx.get(deviceRef);
    firstSeen=!existing.exists;
    if(existing.exists){
      tx.set(deviceRef,{
        label:device.label,
        lastSeenAt:FieldValue.serverTimestamp(),
        revokedAt:FieldValue.delete(),
        schemaVersion:1
      },{merge:true});
    }else{
      tx.create(deviceRef,{
        label:device.label,
        firstSeenAt:FieldValue.serverTimestamp(),
        lastSeenAt:FieldValue.serverTimestamp(),
        schemaVersion:1
      });
      tx.create(userRef.collection('securityEvents').doc(),{
        type:'security.device_first_seen',
        deviceIdHash:deviceRef.id,
        label:device.label,
        createdAt:FieldValue.serverTimestamp()
      });
    }
  });
  return {recorded:true,firstSeen};
}

export async function listSecurityDevices(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const current=normalizeDeviceContext(req.body?.device);
    const currentId=current?deviceDocId(current.id):null;
    const snap=await adminDb.collection('users').doc(user.uid).collection('devices')
      .orderBy('lastSeenAt','desc').limit(20).get();
    return res.json({
      ok:true,
      devices:snap.docs.map(doc=>{
        const data=doc.data()||{};
        return {
          id:doc.id,
          label:String(data.label||'NestBalance device').slice(0,60),
          firstSeenAtMs:data.firstSeenAt?.toMillis?.()??null,
          lastSeenAtMs:data.lastSeenAt?.toMillis?.()??null,
          revokedAtMs:data.revokedAt?.toMillis?.()??null,
          current:doc.id===currentId
        };
      })
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SECURITY_DEVICES_FAILED');
  }
}

export async function revokeNestBalanceSessions(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const revokedBeforeSeconds=Math.floor(Date.now()/1000);
    const userRef=adminDb.collection('users').doc(user.uid);
    const devices=await userRef.collection('devices').limit(50).get();
    const batch=adminDb.batch();
    batch.set(userRef,{
      nestBalanceRevokedBeforeSeconds:revokedBeforeSeconds,
      nestBalanceSessionsRevokedAt:FieldValue.serverTimestamp()
    },{merge:true});
    for(const device of devices.docs){
      batch.set(device.ref,{revokedAt:FieldValue.serverTimestamp()},{merge:true});
    }
    batch.set(userRef.collection('securityEvents').doc(),{
      type:'security.sessions_revoked',
      createdAt:FieldValue.serverTimestamp()
    });
    await batch.commit();
    invalidateNestBalanceSessionCache(user.uid);
    return res.json({ok:true,revokedBeforeSeconds});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SECURITY_REVOKE_FAILED');
  }
}
