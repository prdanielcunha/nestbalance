import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}
function validId(value:string){return /^[A-Za-z0-9_-]{6,128}$/.test(value);}
function cleanText(value:unknown,max=800){
  return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
}
async function assertSharedEntity(householdId:string,kind:string,id:string){
  if(kind==='decision'||kind==='task') return;
  const collection=kind==='transaction'?'transactions':kind==='commitment'?'commitments':kind==='pot'?'savingsPots':'';
  if(!collection||!validId(id)) throw Object.assign(new Error('INVALID_COLLABORATION_ENTITY'),{statusCode:400});
  const snap=await adminDb.collection('households').doc(householdId).collection(collection).doc(id).get();
  if(!snap.exists) throw Object.assign(new Error('COLLABORATION_ENTITY_NOT_FOUND'),{statusCode:404});
  if(snap.data()?.scope==='personal') throw Object.assign(new Error('PRIVATE_RECORD_ACCESS_DENIED'),{statusCode:403});
}
async function memberIds(householdId:string){
  const snap=await adminDb.collection('households').doc(householdId).collection('members').get();
  return new Set(snap.docs.map(doc=>doc.id));
}

export async function loadCollaboration(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const household=adminDb.collection('households').doc(householdId);
    const [tasks,splits,members]=await Promise.all([
      household.collection('sharedTasks').orderBy('updatedAt','desc').limit(80).get(),
      household.collection('expenseSplits').orderBy('updatedAt','desc').limit(50).get(),
      household.collection('members').limit(30).get()
    ]);
    return res.json({
      ok:true,
      tasks:tasks.docs.map(doc=>({id:doc.id,...doc.data()})),
      splits:splits.docs.map(doc=>({id:doc.id,...doc.data()})),
      members:members.docs.map(doc=>({uid:doc.id,displayName:doc.data().displayName||null,email:doc.data().email||null,role:doc.data().role||'member'}))
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'COLLABORATION_LOAD_FAILED');
  }
}

export async function createSharedTask(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    const title=cleanText(req.body?.title,140);
    const assigneeUid=String(req.body?.assigneeUid||'')||null;
    const entityKind=String(req.body?.entityKind||'decision');
    const entityId=String(req.body?.entityId||'');
    if(title.length<2) return error(res,400,'INVALID_SHARED_TASK');
    if(entityKind!=='decision'&&entityKind!=='transaction'&&entityKind!=='commitment'&&entityKind!=='pot') return error(res,400,'INVALID_COLLABORATION_ENTITY');
    if(entityKind!=='decision') await assertSharedEntity(householdId,entityKind,entityId);
    if(assigneeUid){
      const members=await memberIds(householdId);
      if(!members.has(assigneeUid)) return error(res,400,'INVALID_TASK_ASSIGNEE');
    }
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('sharedTasks').doc();
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      tx.create(ref,{
        title,status:'open',assigneeUid,entityKind,entityId:entityKind==='decision'?null:entityId,
        createdBy:user.uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
      });
      tx.create(audit,{type:'collaboration.task_created',actorUid:user.uid,entityType:'shared_task',entityId:ref.id,createdAt:FieldValue.serverTimestamp()});
    });
    return res.status(201).json({ok:true,task:{id:ref.id,title,status:'open',assigneeUid,entityKind,entityId:entityKind==='decision'?null:entityId,createdBy:user.uid}});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','INVALID_COLLABORATION_ENTITY','COLLABORATION_ENTITY_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SHARED_TASK_CREATE_FAILED');
  }
}

export async function updateSharedTask(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const taskId=String(req.body?.taskId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!validId(taskId)) return error(res,400,'INVALID_SHARED_TASK');
    const status=req.body?.status==='done'?'done':'open';
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('sharedTasks').doc(taskId);
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) throw Object.assign(new Error('SHARED_TASK_NOT_FOUND'),{statusCode:404});
      tx.update(ref,{status,updatedBy:user.uid,updatedAt:FieldValue.serverTimestamp(),completedAt:status==='done'?FieldValue.serverTimestamp():null});
      tx.create(audit,{type:`collaboration.task_${status}`,actorUid:user.uid,entityType:'shared_task',entityId:taskId,createdAt:FieldValue.serverTimestamp()});
    });
    return res.json({ok:true,status});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','SHARED_TASK_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SHARED_TASK_UPDATE_FAILED');
  }
}

export async function listComments(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const entityKind=String(req.body?.entityKind||'decision');
    const entityId=String(req.body?.entityId||'general');
    await requireHouseholdMember(householdId,user.uid,'read');
    if(entityKind!=='decision') await assertSharedEntity(householdId,entityKind,entityId);
    const threadKey=entityKind==='decision'?'decision_general':`${entityKind}_${entityId}`;
    const snap=await adminDb.collection('households').doc(householdId).collection('collaborationThreads').doc(threadKey).collection('comments')
      .orderBy('createdAt','asc').limit(100).get();
    return res.json({ok:true,comments:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','INVALID_COLLABORATION_ENTITY','COLLABORATION_ENTITY_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'COMMENTS_LOAD_FAILED');
  }
}

export async function createComment(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const entityKind=String(req.body?.entityKind||'decision');
    const entityId=String(req.body?.entityId||'general');
    const body=cleanText(req.body?.body,800);
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(body.length<1) return error(res,400,'INVALID_COMMENT');
    if(entityKind!=='decision') await assertSharedEntity(householdId,entityKind,entityId);
    const members=await memberIds(householdId);
    const mentionUids=Array.isArray(req.body?.mentionUids)
      ? [...new Set(req.body.mentionUids.map((value:any)=>String(value)).filter((uid:string)=>members.has(uid)))].slice(0,10)
      : [];
    const threadKey=entityKind==='decision'?'decision_general':`${entityKind}_${entityId}`;
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('collaborationThreads').doc(threadKey).collection('comments').doc();
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      tx.create(ref,{body,createdBy:user.uid,mentionUids,createdAt:FieldValue.serverTimestamp()});
      tx.create(audit,{type:'collaboration.comment_created',actorUid:user.uid,entityType:'comment',entityId:ref.id,threadKey,createdAt:FieldValue.serverTimestamp()});
    });
    return res.status(201).json({ok:true,comment:{id:ref.id,body,createdBy:user.uid,mentionUids}});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','INVALID_COLLABORATION_ENTITY','COLLABORATION_ENTITY_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'COMMENT_CREATE_FAILED');
  }
}

export async function createExpenseSplit(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    const description=cleanText(req.body?.description,140);
    const totalMinor=Number(req.body?.totalMinor);
    const sourceTransactionId=String(req.body?.sourceTransactionId||'')||null;
    if(description.length<2||!Number.isSafeInteger(totalMinor)||totalMinor<=0) return error(res,400,'INVALID_EXPENSE_SPLIT');
    if(sourceTransactionId) await assertSharedEntity(householdId,'transaction',sourceTransactionId);
    const members=await memberIds(householdId);
    const raw=Array.isArray(req.body?.shares)?req.body.shares:[];
    const shares=raw.map((item:any)=>({uid:String(item?.uid||''),amountMinor:Number(item?.amountMinor)}));
    if(shares.length<2||shares.some((item:any)=>!members.has(item.uid)||!Number.isSafeInteger(item.amountMinor)||item.amountMinor<0)) return error(res,400,'INVALID_EXPENSE_SPLIT_SHARES');
    if(shares.reduce((sum:number,item:any)=>sum+item.amountMinor,0)!==totalMinor) return error(res,400,'EXPENSE_SPLIT_TOTAL_MISMATCH');
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('expenseSplits').doc();
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      tx.create(ref,{description,totalMinor,sourceTransactionId,shares,status:'open',createdBy:user.uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      tx.create(audit,{type:'collaboration.split_created',actorUid:user.uid,entityType:'expense_split',entityId:ref.id,createdAt:FieldValue.serverTimestamp()});
    });
    return res.status(201).json({ok:true,split:{id:ref.id,description,totalMinor,sourceTransactionId,shares,status:'open',createdBy:user.uid}});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','INVALID_COLLABORATION_ENTITY','COLLABORATION_ENTITY_NOT_FOUND'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'EXPENSE_SPLIT_CREATE_FAILED');
  }
}

export async function settleExpenseSplit(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const splitId=String(req.body?.splitId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!validId(splitId)) return error(res,400,'INVALID_EXPENSE_SPLIT');
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('expenseSplits').doc(splitId);
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) throw Object.assign(new Error('EXPENSE_SPLIT_NOT_FOUND'),{statusCode:404});
      const data=snap.data()||{};
      const participant=Array.isArray(data.shares)&&data.shares.some((item:any)=>item?.uid===user.uid);
      if(data.createdBy!==user.uid&&!participant) throw Object.assign(new Error('EXPENSE_SPLIT_ACCESS_DENIED'),{statusCode:403});
      tx.update(ref,{status:'settled',settledBy:user.uid,settledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      tx.create(audit,{type:'collaboration.split_settled',actorUid:user.uid,entityType:'expense_split',entityId:splitId,createdAt:FieldValue.serverTimestamp()});
    });
    return res.json({ok:true,status:'settled'});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','EXPENSE_SPLIT_NOT_FOUND','EXPENSE_SPLIT_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'EXPENSE_SPLIT_SETTLE_FAILED');
  }
}

export async function getWeeklyRitual(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const weekStart=String(req.body?.weekStart||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return error(res,400,'INVALID_WEEK');
    const snap=await adminDb.collection('households').doc(householdId).collection('weeklyRituals').doc(weekStart).get();
    return res.json({ok:true,ritual:snap.exists?{weekStart,...snap.data()}:null});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'WEEKLY_RITUAL_LOAD_FAILED');
  }
}

export async function saveWeeklyRitual(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const weekStart=String(req.body?.weekStart||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return error(res,400,'INVALID_WEEK');
    const notes=cleanText(req.body?.notes,1200);
    const decisions=cleanText(req.body?.decisions,1200);
    const completed=req.body?.completed===true;
    const household=adminDb.collection('households').doc(householdId);
    const ref=household.collection('weeklyRituals').doc(weekStart);
    const audit=household.collection('auditEvents').doc();
    await adminDb.runTransaction(async tx=>{
      tx.set(ref,{weekStart,notes,decisions,completed,updatedBy:user.uid,updatedAt:FieldValue.serverTimestamp(),...(completed?{completedAt:FieldValue.serverTimestamp(),completedBy:user.uid}:{})},{merge:true});
      tx.create(audit,{type:completed?'collaboration.weekly_completed':'collaboration.weekly_updated',actorUid:user.uid,entityType:'weekly_ritual',entityId:weekStart,createdAt:FieldValue.serverTimestamp()});
    });
    return res.json({ok:true,ritual:{weekStart,notes,decisions,completed,updatedBy:user.uid}});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'WEEKLY_RITUAL_SAVE_FAILED');
  }
}
