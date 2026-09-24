'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';

async function api<T>(path:string,body:unknown):Promise<T>{
  const token=await getBrowserAuthToken();
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body),cache:'no-store'});
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'COLLABORATION_REQUEST_FAILED');
  return json as T;
}

export type CollaborationMember={uid:string;displayName:string|null;email:string|null;role:string};
export type SharedTask={id:string;title:string;status:'open'|'done';assigneeUid:string|null;entityKind:string;entityId:string|null;createdBy:string};
export type ExpenseSplit={id:string;description:string;totalMinor:number;status:'open'|'settled';shares:Array<{uid:string;amountMinor:number}>;createdBy:string};
export type CollaborationComment={id:string;body:string;createdBy:string;mentionUids:string[]};

export function loadCollaboration(householdId:string){
  return api<{ok:true;tasks:SharedTask[];splits:ExpenseSplit[];members:CollaborationMember[]}>('/api/collaboration/load',{householdId});
}
export function createSharedTask(input:{householdId:string;title:string;assigneeUid?:string|null;entityKind?:'decision'|'transaction'|'commitment'|'pot';entityId?:string|null}){
  return api<{ok:true;task:SharedTask}>('/api/collaboration/task/create',input);
}
export function updateSharedTask(householdId:string,taskId:string,status:'open'|'done'){
  return api<{ok:true;status:'open'|'done'}>('/api/collaboration/task/update',{householdId,taskId,status});
}
export function loadComments(householdId:string,entityKind:'decision'|'transaction'|'commitment'|'pot',entityId='general'){
  return api<{ok:true;comments:CollaborationComment[]}>('/api/collaboration/comments/list',{householdId,entityKind,entityId});
}
export function createComment(input:{householdId:string;entityKind:'decision'|'transaction'|'commitment'|'pot';entityId?:string;body:string;mentionUids?:string[]}){
  return api<{ok:true;comment:CollaborationComment}>('/api/collaboration/comments/create',input);
}
export function createExpenseSplit(input:{householdId:string;description:string;totalMinor:number;shares:Array<{uid:string;amountMinor:number}>;sourceTransactionId?:string|null}){
  return api<{ok:true;split:ExpenseSplit}>('/api/collaboration/split/create',input);
}
export function settleExpenseSplit(householdId:string,splitId:string){
  return api<{ok:true;status:'settled'}>('/api/collaboration/split/settle',{householdId,splitId});
}
export function loadWeeklyRitual(householdId:string,weekStart:string){
  return api<{ok:true;ritual:null|{weekStart:string;notes:string;decisions:string;completed:boolean;updatedBy:string}}>('/api/collaboration/weekly/get',{householdId,weekStart});
}
export function saveWeeklyRitual(input:{householdId:string;weekStart:string;notes:string;decisions:string;completed:boolean}){
  return api<{ok:true;ritual:{weekStart:string;notes:string;decisions:string;completed:boolean;updatedBy:string}}>('/api/collaboration/weekly/save',input);
}
