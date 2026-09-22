'use client';
import { auth } from '@/src/lib/firebase/client';
import type { HouseholdRole } from '@/src/core/household';
import type { AppLocale } from '@/src/core/locale';
import type { ProactivityPreferences } from '@/src/core/proactivity';

export type HouseholdMember={
  uid:string;
  role:HouseholdRole;
  displayName:string|null;
  email:string|null;
  photoURL:string|null;
  joinedAtMs:number|null;
};
export type HouseholdInviteSummary={
  id:string;
  role:HouseholdRole;
  email:string|null;
  expiresAtMs:number;
  expired:boolean;
};
export type HouseholdActivity={
  id:string;
  type:string;
  actorUid:string|null;
  targetUid:string|null;
  scope:'household'|'personal';
  createdAtMs:number|null;
};
export type HouseholdSettingsPayload={
  ok:true;
  household:{id:string;name:string;currency:string;locale:AppLocale;ownerUid:string};
  currentRole:HouseholdRole;
  proactivityPreferences:ProactivityPreferences;
  members:HouseholdMember[];
  invites:HouseholdInviteSummary[];
  activity:HouseholdActivity[];
};

async function authToken(){
  const value=await auth?.currentUser?.getIdToken();
  if(!value) throw new Error('AUTH_REQUIRED');
  return value;
}
async function post<T>(path:string,body:Record<string,unknown>):Promise<T>{
  const response=await fetch(path,{
    method:'POST',
    headers:{authorization:`Bearer ${await authToken()}`,'content-type':'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'HOUSEHOLD_REQUEST_FAILED');
  return json as T;
}

export function loadHouseholdSettings(householdId:string){
  return post<HouseholdSettingsPayload>('/api/household/settings',{householdId});
}
export function renameHousehold(householdId:string,name:string){
  return post<{ok:true;name:string}>('/api/household/rename',{householdId,name});
}
export function updateHouseholdLocale(householdId:string,locale:AppLocale){
  return post<{ok:true;locale:AppLocale}>('/api/household/locale',{householdId,locale});
}
export function createHouseholdInvite(input:{householdId:string;role:Exclude<HouseholdRole,'owner'>;email?:string}){
  return post<{ok:true;token:string;role:HouseholdRole;email:string|null;expiresAtMs:number}>('/api/household/invite',input);
}
export function acceptHouseholdInvite(token:string){
  return post<{ok:true;householdId:string;role:HouseholdRole}>('/api/household/invite/accept',{token});
}
export function updateHouseholdMemberRole(input:{householdId:string;uid:string;role:Exclude<HouseholdRole,'owner'>}){
  return post<{ok:true;uid:string;role:HouseholdRole}>('/api/household/member/role',input);
}
export function removeHouseholdMember(input:{householdId:string;uid:string}){
  return post<{ok:true;uid:string}>('/api/household/member/remove',input);
}

export function revokeHouseholdInvite(input:{householdId:string;inviteId:string}){
  return post<{ok:true;inviteId:string;status:'revoked'}>('/api/household/invite/revoke',input);
}

export function updateProactivityPreferences(input:{householdId:string;preferences:ProactivityPreferences}){
  return post<{ok:true;preferences:ProactivityPreferences}>('/api/member/proactivity-preferences',input);
}
