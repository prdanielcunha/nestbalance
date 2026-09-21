'use client';
import { auth } from '@/src/lib/firebase/client';

async function token(){
  const value=await auth?.currentUser?.getIdToken();
  if(!value) throw new Error('AUTH_REQUIRED');
  return value;
}
async function post<T>(path:string,body:Record<string,unknown>):Promise<T>{
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${await token()}`},body:JSON.stringify(body),cache:'no-store'});
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'PRIVACY_REQUEST_FAILED');
  return json as T;
}

export type PrivacyStatus={
  ok:true;privacyVersion:string;accepted:boolean;acceptedAt:string|null;role:string;
  purposes:string[];retention:{financial:string;invites:string;personal:string};
};

export function loadPrivacyStatus(householdId:string){ return post<PrivacyStatus>('/api/privacy/status',{householdId}); }
export function recordPrivacyConsent(householdId:string){ return post<{ok:true;privacyVersion:string}>('/api/privacy/consent',{householdId}); }

export async function exportPrivacyData(householdId:string,mode:'accessible'|'personal'){
  const response=await fetch('/api/privacy/export',{
    method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${await token()}`},
    body:JSON.stringify({householdId,mode}),cache:'no-store'
  });
  if(!response.ok){ const json=await response.json().catch(()=>({})); throw new Error(json.error||'PRIVACY_EXPORT_FAILED'); }
  return response.blob();
}

export function deleteMyPersonalData(householdId:string){
  return post<{ok:true;counts:Record<string,number>}>('/api/privacy/delete-personal',{householdId,confirmation:'DELETE_MY_PERSONAL_DATA'});
}
export function deleteHouseholdPermanently(householdId:string,confirmation:string){
  return post<{ok:true;deletedHouseholdId:string}>('/api/privacy/delete-household',{householdId,confirmation});
}
