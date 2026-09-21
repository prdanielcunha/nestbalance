'use client';
import { auth } from '@/src/lib/firebase/client';
import type { CardBrand } from '@/src/core/cards';
import type { FinancialScope } from '@/src/core/privacy';

export async function createHouseholdCreditCard(input:{
  householdId:string;
  name:string;
  brand:CardBrand;
  closingDay:number;
  dueDay:number;
  last4?:string;
  limitMinor?:number|null;
  scope?:FinancialScope;
}){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');

  const response=await fetch('/api/cards/create',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(input),
    cache:'no-store'
  });

  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'CREDIT_CARD_CREATE_FAILED');
  return json as {ok:true;status:'created'|'existing';id:string};
}
