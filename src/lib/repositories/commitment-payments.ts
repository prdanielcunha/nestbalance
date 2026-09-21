'use client';
import { auth } from '@/src/lib/firebase/client';

function localIsoDate(){
  const d=new Date();
  const offset=d.getTimezoneOffset()*60_000;
  return new Date(d.getTime()-offset).toISOString().slice(0,10);
}

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
  if(!response.ok) throw new Error(json.error||'PAYMENT_REQUEST_FAILED');
  return json as T;
}

export type CommitmentPaymentCandidate={
  commitment:{
    id:string;
    description:string;
    amountMinor:number;
    status?:string;
    recurring?:boolean;
    recurrence?:string|null;
    dueDay?:number|null;
  };
  score:number;
  reasons:string[];
};

export async function findCommitmentPaymentMatches(input:{
  householdId:string;
  amountMinor:number;
  description?:string|null;
  observedOn?:string|null;
}){
  return api<{
    ok:true;
    observedOn:string;
    matches:CommitmentPaymentCandidate[];
  }>('/api/commitments/match-payment',input);
}

export async function payCommitment(input:{
  householdId:string;
  commitmentId:string;
  paidOn?:string;
  evidenceId?:string|null;
}){
  return api<{
    ok:true;
    status:'paid'|'duplicate';
    commitmentId:string;
    periodKey:string;
    paidOn:string;
    transactionId?:string;
  }>('/api/commitments/pay',{...input,paidOn:input.paidOn||localIsoDate()});
}
