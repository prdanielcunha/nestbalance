'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';
import type { SpendingCategory } from '@/src/core/insights';
import type { ProactivityPreferences } from '@/src/core/proactivity';
import type { SavingsPotAutomation } from '@/src/core/savings-pot-automation';

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
  paidThisMonth?:boolean;
  category?:SpendingCategory|null;
  categorySource?:'user'|'learned'|null;
  scope?:'household'|'personal';
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
  updatedAtMs:number|null;
  scope?:'household'|'personal';
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
  scope?:'household'|'personal';
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
  scope?:'household'|'personal';
};

export type HomeSavingsPot={
  id:string;
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  targetDate:string|null;
  note:string|null;
  currency:string;
  institutionName:string|null;
  source:string|null;
  trackingMode:'manual'|'bank_mirror';
  hasCover:boolean;
  coverVersion:number|null;
  automation:SavingsPotAutomation|null;
  status:string;
  scope?:'household'|'personal';
};

export type HomeCardSnapshot={
  id:string;
  name:string;
  last4:string|null;
  statementAmountMinor:number|null;
  dueOn:string|null;
  availableLimitMinor:number|null;
  totalLimitMinor:number|null;
  institutionName:string|null;
  source:string|null;
  scope?:'household'|'personal';
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
  scope?:'household'|'personal';
};

export async function loadHomeData(householdId:string){
  const token=await getBrowserAuthToken();
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
    savingsPots:HomeSavingsPot[];
    cardSnapshots:HomeCardSnapshot[];
    proactivityPreferences:ProactivityPreferences;
    dismissedAttentionKeys:string[];
    dismissedRecurrenceKeys:string[];
    refreshedAt:string;
  };
}
