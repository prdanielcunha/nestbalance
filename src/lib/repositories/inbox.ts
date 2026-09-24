'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';

export type FinancialInboxItem={
  id:string;
  kind:'document'|'invoice'|'movement'|'commitment';
  stage:'processing'|'review'|'resolved';
  title:string;
  secondary:string;
  href:string;
  scope:'household'|'personal';
  createdAtMs:number;
};

export async function loadFinancialInbox(householdId:string){
  const token=await getBrowserAuthToken();
  const response=await fetch('/api/inbox',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'FINANCIAL_INBOX_FAILED');
  return json as {ok:true;items:FinancialInboxItem[];counts:{review:number;processing:number;resolved:number}};
}
