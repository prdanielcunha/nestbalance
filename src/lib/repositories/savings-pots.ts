'use client';
import { auth } from '@/src/lib/firebase/client';
import type { FinancialScope } from '@/src/core/privacy';

export type SavingsPotUpsertInput={
  householdId:string;
  potId?:string|null;
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  institutionName?:string|null;
  scope?:FinancialScope;
};

export async function upsertSavingsPot(input:SavingsPotUpsertInput){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');

  const response=await fetch('/api/savings-pots/upsert',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(input),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SAVINGS_POT_UPSERT_FAILED');
  return json as {ok:true;potId:string;created:boolean};
}
