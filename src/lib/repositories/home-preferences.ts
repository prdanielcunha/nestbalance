'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';
import type { HomePreferences } from '@/src/core/home-preferences';

export async function saveHomePreferences(householdId:string,preferences:HomePreferences){
  const token=await getBrowserAuthToken();
  const response=await fetch('/api/member/home-preferences',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId,preferences}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'HOME_PREFERENCES_UPDATE_FAILED');
  return json as {ok:true;preferences:HomePreferences};
}
