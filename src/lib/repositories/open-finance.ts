'use client';
import { auth } from '@/src/lib/firebase/client';
import type { OpenFinanceInstitutionKey } from '@/src/core/open-finance';

async function api<T>(path:string,body:unknown):Promise<T>{
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  const response=await fetch(path,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'OPEN_FINANCE_REQUEST_FAILED');
  return json as T;
}

export type OpenFinanceConnection={
  id:string;
  institutionKey:OpenFinanceInstitutionKey;
  institutionName:string;
  institutionCode:string;
  status:string;
  accountCount:number;
  lastSyncStatus:string;
  lastSyncAt:string|null;
};

export async function listOpenFinanceConnections(householdId:string){
  return api<{
    ok:true;
    configured:boolean;
    provider:'belvo_ofda';
    connections:OpenFinanceConnection[];
  }>('/api/open-finance/list',{householdId});
}

export async function startOpenFinanceConnection(input:{
  householdId:string;
  institutionKey:OpenFinanceInstitutionKey;
  legalName:string;
  cpf:string;
  returnOrigin:string;
}){
  return api<{
    ok:true;
    sessionId:string;
    provider:'belvo_ofda';
    institution:{key:OpenFinanceInstitutionKey;name:string};
    widgetUrl:string;
    expiresInSeconds:number;
  }>('/api/open-finance/start',input);
}

export async function completeOpenFinanceConnection(input:{
  householdId:string;
  sessionId:string;
  linkId:string;
}){
  return api<{
    ok:true;
    connectionId:string;
    institutionName:string;
    synced:number;
    skipped:number;
    status:string;
  }>('/api/open-finance/complete',input);
}

export async function syncOpenFinanceConnection(input:{
  householdId:string;
  connectionId:string;
}){
  return api<{
    ok:true;
    connectionId:string;
    synced:number;
    skipped:number;
    status:string;
  }>('/api/open-finance/sync',input);
}
