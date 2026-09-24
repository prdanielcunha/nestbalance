import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin.js';

export type AiGatewayProvider='gemini'|'openai';
export type AiGatewayTask='redacted_text'|'financial_image'|'card_statement_image'|'audio_transcription';

type GatewayContext={
  householdId:string;
  userUid:string;
  provider:AiGatewayProvider;
  task:AiGatewayTask;
  model:string;
  promptVersion:string;
  fingerprint:string;
  maxGlobalRequests?:number;
};

const TASK_UNITS:Record<AiGatewayTask,number>={
  redacted_text:1,
  audio_transcription:3,
  financial_image:5,
  card_statement_image:6
};

const DEFAULT_GLOBAL_UNITS=600;
const DEFAULT_HOUSEHOLD_UNITS=180;
const DEFAULT_USER_UNITS=90;
const BREAKER_THRESHOLD=3;
const BREAKER_OPEN_MS=2*60*1000;

function integerEnv(name:string,fallback:number,max:number){
  const value=Number(process.env[name]||fallback);
  return Number.isInteger(value)&&value>0?Math.min(value,max):fallback;
}

function disabledValues(name:string){
  return new Set(String(process.env[name]||'')
    .split(',')
    .map(value=>value.trim().toLowerCase())
    .filter(Boolean));
}

function hash(value:string){
  return createHash('sha256').update(value).digest('hex');
}

function dayKey(){
  return new Date().toISOString().slice(0,10);
}

export function aiGatewayLimits(){
  return {
    globalUnits:integerEnv('NESTBALANCE_AI_DAILY_GLOBAL_UNITS',DEFAULT_GLOBAL_UNITS,20_000),
    householdUnits:integerEnv('NESTBALANCE_AI_DAILY_HOUSEHOLD_UNITS',DEFAULT_HOUSEHOLD_UNITS,5_000),
    userUnits:integerEnv('NESTBALANCE_AI_DAILY_USER_UNITS',DEFAULT_USER_UNITS,2_000)
  };
}

function assertEnabled(context:GatewayContext){
  if(process.env.NESTBALANCE_AI_GATEWAY_ENABLED==='false'){
    throw Object.assign(new Error('AI_GATEWAY_DISABLED'),{statusCode:503});
  }
  if(disabledValues('NESTBALANCE_AI_DISABLED_PROVIDERS').has(context.provider)){
    throw Object.assign(new Error('AI_PROVIDER_DISABLED'),{statusCode:503});
  }
  if(disabledValues('NESTBALANCE_AI_DISABLED_TASKS').has(context.task)){
    throw Object.assign(new Error('AI_TASK_DISABLED'),{statusCode:503});
  }
}

async function reserve(context:GatewayContext){
  assertEnabled(context);
  const date=dayKey();
  const units=TASK_UNITS[context.task];
  const limits=aiGatewayLimits();
  const actorKey=hash(context.userUid).slice(0,24);
  const householdKey=hash(context.householdId).slice(0,24);
  const fingerprintHash=hash(context.fingerprint).slice(0,40);
  const globalRef=adminDb.collection('_nestbalanceAiRuntime').doc(`global-${context.provider}-${date}`);
  const userRef=adminDb.collection('_nestbalanceAiRuntime').doc(`user-${context.provider}-${actorKey}-${date}`);
  const breakerRef=adminDb.collection('_nestbalanceAiRuntime').doc(`breaker-${context.provider}-${context.task}`);
  const householdRef=adminDb.doc(`households/${context.householdId}/aiRuntime/${date}-${context.task}`);

  await adminDb.runTransaction(async tx=>{
    const [globalSnap,userSnap,householdSnap,breakerSnap]=await Promise.all([
      tx.get(globalRef),tx.get(userRef),tx.get(householdRef),tx.get(breakerRef)
    ]);
    const breaker=breakerSnap.data()||{};
    const openUntilMs=Number(breaker.openUntilMs||0);
    if(openUntilMs>Date.now()) throw Object.assign(new Error('AI_CIRCUIT_OPEN'),{statusCode:503});

    const globalRequests=Number(globalSnap.data()?.requests||0);
    const globalUnits=Number(globalSnap.data()?.units||0);
    const userUnits=Number(userSnap.data()?.units||0);
    const householdUnits=Number(householdSnap.data()?.units||0);
    if(context.maxGlobalRequests&&globalRequests>=context.maxGlobalRequests){
      throw Object.assign(new Error('AI_GLOBAL_REQUEST_CAP_REACHED'),{statusCode:429});
    }
    if(globalUnits+units>limits.globalUnits) throw Object.assign(new Error('AI_GLOBAL_BUDGET_REACHED'),{statusCode:429});
    if(householdUnits+units>limits.householdUnits) throw Object.assign(new Error('AI_HOUSEHOLD_BUDGET_REACHED'),{statusCode:429});
    if(userUnits+units>limits.userUnits) throw Object.assign(new Error('AI_USER_BUDGET_REACHED'),{statusCode:429});

    const common={
      date,
      provider:context.provider,
      updatedAt:FieldValue.serverTimestamp()
    };
    tx.set(globalRef,{...common,requests:globalRequests+1,units:globalUnits+units},{merge:true});
    tx.set(userRef,{...common,units:userUnits+units},{merge:true});
    tx.set(householdRef,{
      date,
      task:context.task,
      provider:context.provider,
      units:householdUnits+units,
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
  });

  return {date,units,actorKey,householdKey,fingerprintHash,breakerRef};
}

async function recordOutcome(
  context:GatewayContext,
  reservation:Awaited<ReturnType<typeof reserve>>,
  status:'success'|'failure',
  durationMs:number
){
  const eventRef=adminDb.doc(`households/${context.householdId}/aiUsageEvents/${crypto.randomUUID()}`);
  const payload={
    provider:context.provider,
    task:context.task,
    model:context.model.slice(0,120),
    promptVersion:context.promptVersion.slice(0,80),
    unitCount:reservation.units,
    status,
    durationMs:Math.max(0,Math.round(durationMs)),
    actorKey:reservation.actorKey,
    householdKey:reservation.householdKey,
    fingerprintHash:reservation.fingerprintHash,
    createdAt:FieldValue.serverTimestamp()
  };

  await adminDb.runTransaction(async tx=>{
    const breakerSnap=await tx.get(reservation.breakerRef);
    const breaker=breakerSnap.data()||{};
    if(status==='success'){
      tx.set(reservation.breakerRef,{
        provider:context.provider,
        task:context.task,
        consecutiveFailures:0,
        openUntilMs:0,
        updatedAt:FieldValue.serverTimestamp()
      },{merge:true});
    }else{
      const failures=Number(breaker.consecutiveFailures||0)+1;
      tx.set(reservation.breakerRef,{
        provider:context.provider,
        task:context.task,
        consecutiveFailures:failures,
        openUntilMs:failures>=BREAKER_THRESHOLD?Date.now()+BREAKER_OPEN_MS:Number(breaker.openUntilMs||0),
        updatedAt:FieldValue.serverTimestamp()
      },{merge:true});
    }
    tx.create(eventRef,payload);
  });
}

export async function runAiGateway<T>(context:GatewayContext,operation:()=>Promise<T>):Promise<T>{
  const reservation=await reserve(context);
  const started=Date.now();
  try{
    const result=await operation();
    await recordOutcome(context,reservation,'success',Date.now()-started).catch(()=>undefined);
    return result;
  }catch(error){
    await recordOutcome(context,reservation,'failure',Date.now()-started).catch(()=>undefined);
    throw error;
  }
}
