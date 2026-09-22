'use client';
import { auth } from '@/src/lib/firebase/client';
import type { FinancialScope } from '@/src/core/privacy';
import type { SavingsPotAutomation } from '@/src/core/savings-pot-automation';

export type SavingsPotUpsertInput={
  householdId:string;
  potId?:string|null;
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  targetDate?:string|null;
  note?:string|null;
  institutionName?:string|null;
  scope?:FinancialScope;
};

async function token(){
  const value=await auth?.currentUser?.getIdToken();
  if(!value) throw new Error('AUTH_REQUIRED');
  return value;
}

async function postJson<T>(path:string,body:unknown){
  const authorization=await token();
  const response=await fetch(path,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${authorization}`},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SAVINGS_POT_REQUEST_FAILED');
  return json as T;
}

export async function upsertSavingsPot(input:SavingsPotUpsertInput){
  return postJson<{ok:true;potId:string;created:boolean}>('/api/savings-pots/upsert',input);
}

export async function moveSavingsPot(input:{
  householdId:string;
  potId:string;
  direction:'reserve'|'withdraw';
  amountMinor:number;
  note?:string|null;
}){
  return postJson<{ok:true;potId:string;resultingBalanceMinor:number}>('/api/savings-pots/move',input);
}

export async function updateSavingsPotAutomation(input:{
  householdId:string;
  potId:string;
  automation:SavingsPotAutomation|null;
}){
  return postJson<{ok:true;automation:SavingsPotAutomation|null}>('/api/savings-pots/automation',input);
}

export async function syncSavingsPotAutomations(householdId:string){
  return postJson<{ok:true;applied:number}>('/api/savings-pots/automation/sync',{householdId});
}

export type SavingsPotActivity={
  id:string;
  type:string;
  amountMinor:number;
  resultingBalanceMinor:number;
  note:string|null;
  source:string|null;
  createdAtMs:number;
};

export async function getSavingsPotDetail(householdId:string,potId:string){
  return postJson<{ok:true;potId:string;activities:SavingsPotActivity[]}>('/api/savings-pots/detail',{householdId,potId});
}

export async function archiveSavingsPot(householdId:string,potId:string){
  return postJson<{ok:true;potId:string}>('/api/savings-pots/archive',{householdId,potId});
}

export async function uploadSavingsPotCover(householdId:string,potId:string,file:File){
  const authorization=await token();
  const response=await fetch('/api/savings-pots/cover/upload',{
    method:'POST',
    headers:{
      authorization:`Bearer ${authorization}`,
      'content-type':file.type,
      'x-nestbalance-household-id':householdId,
      'x-nestbalance-savings-pot-id':potId
    },
    body:file,
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SAVINGS_POT_COVER_UPLOAD_FAILED');
  return json as {ok:true;potId:string;coverVersion:number};
}

export async function getSavingsPotCover(householdId:string,potId:string){
  const authorization=await token();
  const response=await fetch('/api/savings-pots/cover/preview',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${authorization}`},
    body:JSON.stringify({householdId,potId}),
    cache:'no-store'
  });
  if(!response.ok) throw new Error('SAVINGS_POT_COVER_PREVIEW_FAILED');
  return response.blob();
}

export async function deleteSavingsPotCover(householdId:string,potId:string){
  return postJson<{ok:true;potId:string}>('/api/savings-pots/cover/delete',{householdId,potId});
}
