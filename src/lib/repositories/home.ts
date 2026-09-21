'use client';
import { auth } from '@/src/lib/firebase/client';

export type HomeRow={
  id:string;
  description:string;
  amountMinor:number;
  currency:string;
  direction?:'expense'|'income'|'transfer';
  status?:string;
  dueDay?:number|null;
  recurring?:boolean;
  recurrence?:string|null;
  installment?:{current:number;total:number}|null;
  observedOn?:string|null;
};

export type HomeAccount={
  id:string;
  name:string;
  type:string;
  balanceMinor:number;
  currency:string;
  status:string;
};

export async function loadHomeData(householdId:string){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  const response=await fetch('/api/home',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'HOME_LOAD_FAILED');
  return json as {
    ok:true;
    accounts:HomeAccount[];
    transactions:HomeRow[];
    commitments:HomeRow[];
    refreshedAt:string;
  };
}
