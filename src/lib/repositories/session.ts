'use client';
import { auth } from '@/src/lib/firebase/client';
import type { HouseholdRole } from '@/src/core/household';
import type { AppLocale } from '@/src/core/locale';
import { getNestBalanceDeviceContext } from '@/src/lib/device-context';

export type HouseholdSessionOption={
  id:string;
  name:string;
  role:HouseholdRole;
  locale:AppLocale;
  currency:string;
};

async function token(){
  const value=await auth?.currentUser?.getIdToken();
  if(!value) throw new Error('AUTH_REQUIRED');
  return value;
}

async function post(path:string,body?:Record<string,unknown>){
  const response=await fetch(path,{
    method:'POST',
    headers:{
      authorization:`Bearer ${await token()}`,
      'content-type':'application/json'
    },
    body:JSON.stringify(body||{}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SESSION_REQUEST_FAILED');
  return json;
}

export async function bootstrapSession(householdId?:string){
  const device=getNestBalanceDeviceContext();
  return await post('/api/session/bootstrap',{...(householdId?{householdId}:{}),...(device?{device}:{})}) as {
    ok:true;
    householdId:string;
    households:HouseholdSessionOption[];
    locale:AppLocale;
    currency:string;
    created:boolean;
    deviceFirstSeen?:boolean;
  };
}

export async function selectHousehold(householdId:string){
  return await post('/api/session/select-household',{householdId}) as {
    ok:true;
    householdId:string;
    households:HouseholdSessionOption[];
    locale:AppLocale;
    currency:string;
  };
}
