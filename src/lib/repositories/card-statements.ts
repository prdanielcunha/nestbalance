'use client';
import { auth } from '@/src/lib/firebase/client';

export type StatementPreviewItem={
  key:string;
  lineNumber:number;
  description:string;
  amountMinor:number;
  observedOn:string|null;
  installment:{current:number;total:number}|null;
  confidence:'high'|'medium';
  needsReview:string[];
  sourceLine:string;
};

export type StatementProjectionMonth={
  dueOn:string;
  totalMinor:number;
  itemCount:number;
  installmentCount:number;
};

export type CreditCardStatementPreview={
  ok:true;
  previewId:string;
  card:{id:string;name:string;dueDay:number;closingDay:number};
  statementDueOn:string;
  items:StatementPreviewItem[];
  currentInvoiceMinor:number;
  projectedMonths:StatementProjectionMonth[];
  ignoredLineCount:number;
  sourceKind:'native'|'ai';
  model:string|null;
  truncated:boolean;
  warnings:string[];
};

async function post<T>(path:string,body:unknown):Promise<T>{
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  const response=await fetch(path,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'REQUEST_FAILED');
  return json as T;
}

export function previewCreditCardStatement(input:{
  householdId:string;
  cardId:string;
  evidenceId:string;
  statementDueOn:string;
}){
  return post<CreditCardStatementPreview>('/api/cards/statements/preview',input);
}

export function commitCreditCardStatement(input:{
  householdId:string;
  previewId:string;
  itemKeys:string[];
}){
  return post<{ok:true;batchId:string;created:number;duplicates:number}>('/api/cards/statements/commit',input);
}
