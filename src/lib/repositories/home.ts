'use client';
import { auth } from '@/src/lib/firebase/client';

export type HomeRow={
  id:string;
  description:string;
  amountMinor:number;
  currency:string;
  direction?:'expense'|'income'|'transfer';
  source?:string|null;
  status?:string;
  dueDay?:number|null;
  recurring?:boolean;
  recurrence?:string|null;
  installment?:{current:number;total:number}|null;
  installmentPlanId?:string|null;
  cardId?:string|null;
  invoiceKey?:string|null;
  invoiceImportId?:string|null;
  observedOn?:string|null;
};

export type HomeAccount={
  id:string;
  name:string;
  type:string;
  connectedProductType?:string|null;
  source?:string|null;
  institutionName?:string|null;
  connectionId?:string|null;
  automaticallyInvestedMinor?:number|null;
  balanceMinor:number;
  currency:string;
  status:string;
};

export type HomeInstallmentPlan={
  id:string;
  description:string;
  amountMinor:number;
  currency:string;
  status:string;
  totalInstallments:number;
  lastObservedInstallment:number;
  anchorDueOn:string;
  lastObservedInvoiceKey:string;
};

export type HomeInvoiceImport={
  id:string;
  cardId:string;
  invoiceKey:string;
  dueOn:string;
  status:string;
  confirmedAmountMinor:number;
  paymentStatus:string;
  paidAmountMinor:number;
  paidOn:string|null;
  paidFromAccountId:string|null;
};

export type HomeCreditCard={
  id:string;
  name:string;
  brand:string;
  closingDay:number;
  dueDay:number;
  last4:string|null;
  limitMinor:number|null;
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
    cards:HomeCreditCard[];
    transactions:HomeRow[];
    commitments:HomeRow[];
    installmentPlans:HomeInstallmentPlan[];
    invoiceImports:HomeInvoiceImport[];
    refreshedAt:string;
  };
}
