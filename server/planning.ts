import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { normalizeIntelligencePreferences } from '../src/core/intelligence-preferences.js';
import { simulateFinancialScenario } from '../src/core/financial-intelligence.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function validId(value:string){
  return /^[A-Za-z0-9_-]{6,128}$/.test(value);
}

function validPeriodKey(value:string){
  return /^\d{4}-\d{2}$/.test(value);
}

export async function listPlanningScenarios(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const snap=await adminDb.collection('households').doc(householdId).collection('planningScenarios')
      .orderBy('updatedAt','desc').limit(40).get();
    const scenarios=snap.docs
      .map(doc=>({id:doc.id,...doc.data()}))
      .filter((item:any)=>item.scope!=='personal'||item.createdBy===user.uid)
      .map((item:any)=>({
        id:item.id,
        name:String(item.name||'Cenário'),
        kind:item.kind,
        amountMinor:Number(item.amountMinor)||0,
        scope:item.scope==='personal'?'personal':'household',
        createdBy:String(item.createdBy||''),
        result:item.result&&typeof item.result==='object'?item.result:null
      }));
    return res.json({ok:true,scenarios});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PLANNING_SCENARIOS_LOAD_FAILED');
  }
}

export async function savePlanningScenario(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    const name=String(req.body?.name||'').trim().replace(/\s+/g,' ');
    const scope=req.body?.scope==='personal'?'personal':'household';
    const kind=req.body?.kind;
    const amountMinor=Number(req.body?.amountMinor);
    const availableMinor=Number(req.body?.availableMinor);
    const committedMinor=Number(req.body?.committedMinor);
    if(name.length<2||name.length>80) return error(res,400,'INVALID_SCENARIO_NAME');
    if(kind!=='purchase'&&kind!=='income_drop'&&kind!=='extra_income'&&kind!=='debt_payment') return error(res,400,'INVALID_SCENARIO_KIND');
    if(!Number.isSafeInteger(amountMinor)||amountMinor<0||amountMinor>1_000_000_000_000) return error(res,400,'INVALID_SCENARIO_AMOUNT');
    if(!Number.isSafeInteger(availableMinor)||!Number.isSafeInteger(committedMinor)) return error(res,400,'INVALID_SCENARIO_BASELINE');

    const result=simulateFinancialScenario({availableMinor,committedMinor,amountMinor,kind});
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('planningScenarios').doc();
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      tx.create(ref,{
        name,kind,amountMinor,scope,
        createdBy:user.uid,
        result,
        createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        schemaVersion:1
      });
      tx.create(audit,{
        type:'planning.scenario_saved',
        scope,
        ownerUid:scope==='personal'?user.uid:null,
        actorUid:user.uid,
        entityType:'planning_scenario',
        entityId:ref.id,
        createdAt:FieldValue.serverTimestamp()
      });
    });
    return res.status(201).json({ok:true,scenario:{id:ref.id,name,kind,amountMinor,scope,createdBy:user.uid,result}});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PLANNING_SCENARIO_SAVE_FAILED');
  }
}

export async function deletePlanningScenario(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const scenarioId=String(req.body?.scenarioId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!validId(scenarioId)) return error(res,400,'INVALID_SCENARIO');
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('planningScenarios').doc(scenarioId);
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) return;
      const data=snap.data()||{};
      if(data.createdBy!==user.uid) throw Object.assign(new Error('SCENARIO_DELETE_DENIED'),{statusCode:403});
      tx.delete(ref);
      tx.create(audit,{
        type:'planning.scenario_deleted',
        scope:data.scope==='personal'?'personal':'household',
        ownerUid:data.scope==='personal'?user.uid:null,
        actorUid:user.uid,
        entityType:'planning_scenario',
        entityId:scenarioId,
        createdAt:FieldValue.serverTimestamp()
      });
    });
    return res.json({ok:true});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','SCENARIO_DELETE_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'PLANNING_SCENARIO_DELETE_FAILED');
  }
}

export async function getMonthlyClose(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const periodKey=String(req.body?.periodKey||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    if(!validPeriodKey(periodKey)) return error(res,400,'INVALID_PERIOD');
    const snap=await adminDb.collection('households').doc(householdId).collection('monthlyCloses').doc(periodKey).get();
    if(!snap.exists) return res.json({ok:true,close:null});
    const data=snap.data()||{};
    return res.json({ok:true,close:{
      periodKey,
      status:String(data.status||'closed'),
      completedBy:String(data.completedBy||''),
      checklist:Array.isArray(data.checklist)?data.checklist:[],
      summary:data.summary&&typeof data.summary==='object'?data.summary:null
    }});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'MONTHLY_CLOSE_LOAD_FAILED');
  }
}

export async function completeMonthlyClose(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const periodKey=String(req.body?.periodKey||'');
    await requireHouseholdMember(householdId,user.uid,'manage_finance');
    if(!validPeriodKey(periodKey)) return error(res,400,'INVALID_PERIOD');
    const checklist=Array.isArray(req.body?.checklist)?req.body.checklist.slice(0,10):[];
    if(!checklist.length||checklist.some((item:any)=>item?.status!=='done')) return error(res,409,'MONTHLY_CLOSE_HAS_EXCEPTIONS');
    const summary=req.body?.summary&&typeof req.body.summary==='object'?req.body.summary:{};
    const safeSummary={
      availableMinor:Number.isSafeInteger(summary.availableMinor)?summary.availableMinor:null,
      committedMinor:Number.isSafeInteger(summary.committedMinor)?summary.committedMinor:null,
      projectedRemainderMinor:Number.isSafeInteger(summary.projectedRemainderMinor)?summary.projectedRemainderMinor:null,
      transactionCount:Number.isSafeInteger(summary.transactionCount)?summary.transactionCount:0
    };
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('monthlyCloses').doc(periodKey);
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      tx.set(ref,{
        periodKey,status:'closed',checklist,summary:safeSummary,
        completedBy:user.uid,
        completedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        schemaVersion:1
      },{merge:true});
      tx.create(audit,{
        type:'planning.month_closed',
        actorUid:user.uid,
        entityType:'monthly_close',
        entityId:periodKey,
        createdAt:FieldValue.serverTimestamp()
      });
    });
    return res.json({ok:true,close:{periodKey,status:'closed',completedBy:user.uid,checklist,summary:safeSummary}});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'MONTHLY_CLOSE_FAILED');
  }
}

export async function updateIntelligencePreferences(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const preferences=normalizeIntelligencePreferences(req.body?.preferences);
    const memberRef=adminDb.collection('households').doc(householdId).collection('members').doc(user.uid);
    await memberRef.set({
      intelligencePreferences:preferences,
      intelligencePreferencesUpdatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    return res.json({ok:true,preferences});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'INTELLIGENCE_PREFERENCES_UPDATE_FAILED');
  }
}
