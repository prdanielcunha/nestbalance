'use client';
import { auth } from '@/src/lib/firebase/client';
import type { AccountType } from '@/src/core/accounts';
import type { FinancialScope } from '@/src/core/privacy';

export async function createHouseholdAccount(input:{householdId:string;name:string;type:AccountType;balanceMinor:number;scope?:FinancialScope}){
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


export async function updateHouseholdAccountBalance(input:{householdId:string;accountId:string;balanceMinor:number}){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  const response=await fetch('/api/accounts/update-balance',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(input),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'ACCOUNT_BALANCE_UPDATE_FAILED');
  return json as {ok:true;accountId:string;previousBalanceMinor:number;balanceMinor:number};
}
