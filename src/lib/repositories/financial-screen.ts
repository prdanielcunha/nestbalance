'use client';
import { auth } from '@/src/lib/firebase/client';
import type { FinancialScope } from '@/src/core/privacy';
import type { AiFinancialScreenSnapshot } from '@/src/core/ai-financial';

export type FinancialScreenCommitResult={
  ok:true;
  evidenceId:string;
  screenType:string;
  institution:string|null;
  analysisSource:string;
  counts:{
    accounts:number;
    pots:number;
    cards:number;
    commitments:number;
    movements:number;
    skipped:number;
  };
};

export async function commitFinancialScreen(input:{
  householdId:string;
  evidenceId:string;
  scope?:FinancialScope;
  screenSnapshot?:AiFinancialScreenSnapshot|null;
  analysisSource?:'server_vision'|'gemini_text'|'local_ocr'|'client_reviewed';
}){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');

  const response=await fetch('/api/financial-screen/commit',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(input),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'FINANCIAL_SCREEN_COMMIT_FAILED');
  return json as FinancialScreenCommitResult;
}
