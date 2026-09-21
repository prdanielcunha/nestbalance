'use client';
import { auth } from '@/src/lib/firebase/client';
import type { AccountType } from '@/src/core/accounts';

export async function createHouseholdAccount(input:{householdId:string;name:string;type:AccountType;balanceMinor:number}){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  const response=await fetch('/api/accounts/create',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(input)
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'ACCOUNT_CREATE_FAILED');
  return json as {ok:true;status:'created'|'existing';id:string};
}
