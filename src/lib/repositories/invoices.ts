'use client';
import { auth } from '@/src/lib/firebase/client';
import type { InvoicePreview } from '@/src/core/invoices';

export type InvoicePreviewResponse={
  ok:true;
  evidenceId:string;
  card:{
    id:string;
    name:string;
    brand:string;
    closingDay:number;
    dueDay:number;
    last4:string|null;
  };
  preview:InvoicePreview;
};

export async function previewInvoice(input:{
  householdId:string;
  cardId:string;
  evidenceId:string;
  referenceDate?:string;
}){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');

  const response=await fetch('/api/invoices/preview',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(input),
    cache:'no-store'
  });

  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'INVOICE_PREVIEW_FAILED');
  return json as InvoicePreviewResponse;
}


export type InvoiceCommitResponse={
  ok:true;
  status:'committed'|'duplicate';
  invoiceKey:string;
  evidenceId:string;
  selected:number;
  created:number;
  duplicates:number;
  installmentPlans:number;
};

export async function commitInvoice(input:{
  householdId:string;
  cardId:string;
  evidenceId:string;
  itemIds:string[];
  referenceDate?:string;
}){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');

  const response=await fetch('/api/invoices/commit',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(input),
    cache:'no-store'
  });

  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'INVOICE_COMMIT_FAILED');
  return json as InvoiceCommitResponse;
}


export type InvoicePaymentResponse={
  ok:true;
  status:'paid'|'duplicate';
  transactionId:string;
  amountMinor:number;
  invoiceImportId:string;
  paidOn:string;
};

function localIsoDate(){
  const d=new Date();
  const offset=d.getTimezoneOffset()*60_000;
  return new Date(d.getTime()-offset).toISOString().slice(0,10);
}

export async function payInvoice(input:{
  householdId:string;
  invoiceImportId:string;
  accountId:string;
  paidOn?:string;
}){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');

  const response=await fetch('/api/invoices/pay',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({...input,paidOn:input.paidOn||localIsoDate()}),
    cache:'no-store'
  });

  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'INVOICE_PAYMENT_FAILED');
  return json as InvoicePaymentResponse;
}
