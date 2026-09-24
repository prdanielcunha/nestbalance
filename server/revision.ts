import type { Request, Response } from 'express';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { syncDomainsForAuditType } from '../src/core/realtime.js';

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

export async function streamHouseholdRevision(req:Request,res:Response){
  let unsubscribe:(()=>void)|null=null;
  let heartbeat:NodeJS.Timeout|null=null;
  let endTimer:NodeJS.Timeout|null=null;
  let closed=false;

  const cleanup=()=>{
    if(closed) return;
    closed=true;
    if(heartbeat) clearInterval(heartbeat);
    if(endTimer) clearTimeout(endTimer);
    try{ unsubscribe?.(); }catch{}
  };

  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);

    res.status(200);
    res.setHeader('Content-Type','text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control','private, no-store, no-transform');
    res.setHeader('Connection','keep-alive');
    res.setHeader('X-Accel-Buffering','no');
    res.flushHeaders?.();

    let lastRevision='';
    const query=adminDb.collection('households').doc(householdId)
      .collection('auditEvents')
      .orderBy('createdAt','desc')
      .limit(1);

    unsubscribe=query.onSnapshot(snapshot=>{
      if(closed) return;
      const latest=snapshot.docs[0]||null;
      const revision=latest?`${timestampMillis(latest.data()?.createdAt)}:${latest.id}`:'0';
      if(revision===lastRevision) return;
      lastRevision=revision;
      const data=latest?.data()||{};
      const payload={
        revision,
        domains:syncDomainsForAuditType(data.type),
        changedAt:timestampMillis(data.createdAt)||Date.now()
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    },()=>{
      if(closed) return;
      res.write('event: error\ndata: {"code":"REVISION_STREAM_FAILED"}\n\n');
      res.end();
      cleanup();
    });

    heartbeat=setInterval(()=>{
      if(!closed) res.write(`: keepalive ${Date.now()}\n\n`);
    },20_000);

    // Reconnect before typical managed-request timeouts; the client resumes by revision.
    endTimer=setTimeout(()=>{
      if(!closed) res.end();
      cleanup();
    },210_000);

    req.on('close',cleanup);
  }catch(err:any){
    cleanup();
    const safe=['AUTH_REQUIRED','INVALID_SESSION','INVALID_HOUSEHOLD','HOUSEHOLD_ACCESS_DENIED'];
    if(!res.headersSent){
      return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOUSEHOLD_REVISION_STREAM_FAILED');
    }
    res.end();
  }
}
