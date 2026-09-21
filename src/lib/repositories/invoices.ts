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
