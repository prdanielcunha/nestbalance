import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type Bucket={startedAt:number;count:number};
const buckets=new Map<string,Bucket>();
let lastSweep=Date.now();

function sweep(now:number){
  if(now-lastSweep<60_000) return;
  lastSweep=now;
  for(const [key,value] of buckets){
    if(now-value.startedAt>5*60_000) buckets.delete(key);
  }
  if(buckets.size>5000){
    const oldest=[...buckets.entries()].sort((a,b)=>a[1].startedAt-b[1].startedAt).slice(0,buckets.size-4000);
    for(const [key] of oldest) buckets.delete(key);
  }
}

function actorKey(req:Request){
  const authorization=req.header('authorization')||'';
  if(authorization) return createHash('sha256').update(authorization).digest('hex').slice(0,24);
  const forwarded=String(req.header('x-forwarded-for')||'').split(',')[0].trim();
  return createHash('sha256').update(forwarded||'anonymous').digest('hex').slice(0,24);
}

export function runtimeIdentity(){
  const service=String(process.env.K_SERVICE||'');
  const environment=process.env.NESTBALANCE_ENV||(
    service==='nestbalance-api-prod'?'production':
    service==='nestbalance-api'?'homologation':'local'
  );
  const release=String(process.env.NESTBALANCE_RELEASE_SHA||process.env.K_REVISION||'').slice(0,48)||null;
  return {environment,release};
}

export function securityHeaders(_req:Request,res:Response,next:NextFunction){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-site');
  next();
}

export function requestTelemetry(req:Request,res:Response,next:NextFunction){
  const requestId=randomUUID();
  const started=process.hrtime.bigint();
  res.setHeader('X-Request-ID',requestId);
  res.on('finish',()=>{
    const durationMs=Number(process.hrtime.bigint()-started)/1_000_000;
    console.log(JSON.stringify({
      event:'http_request',
      requestId,
      method:req.method,
      path:req.path,
      status:res.statusCode,
      durationMs:Math.round(durationMs),
      ...runtimeIdentity()
    }));
  });
  next();
}

export function rateLimit(options:{windowMs:number;max:number;namespace:string}){
  return (req:Request,res:Response,next:NextFunction)=>{
    const now=Date.now();
    sweep(now);
    const key=options.namespace+':'+actorKey(req);
    const current=buckets.get(key);
    const bucket=!current||now-current.startedAt>=options.windowMs?{startedAt:now,count:0}:current;
    bucket.count++;
    buckets.set(key,bucket);
    const remaining=Math.max(0,options.max-bucket.count);
    res.setHeader('X-RateLimit-Limit',String(options.max));
    res.setHeader('X-RateLimit-Remaining',String(remaining));
    if(bucket.count>options.max){
      const retrySeconds=Math.max(1,Math.ceil((options.windowMs-(now-bucket.startedAt))/1000));
      res.setHeader('Retry-After',String(retrySeconds));
      return res.status(429).json({ok:false,error:'RATE_LIMITED'});
    }
    next();
  };
}
