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

  let lastError:unknown=null;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch('/api/financial-screen/commit',{
        method:'POST',
        headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
        body:JSON.stringify(input),
        cache:'no-store'
      });
      const json=await response.json().catch(()=>({}));
      if(response.ok) return json as FinancialScreenCommitResult;
      const code=String((json as {error?:unknown}).error||'FINANCIAL_SCREEN_COMMIT_FAILED');
      if(attempt===0&&response.status>=500){
        lastError=new Error(code);
        continue;
      }
      throw new Error(code);
    }catch(err){
      lastError=err;
      if(attempt===0&&(err instanceof TypeError||String((err as any)?.message||'')==='Failed to fetch')) continue;
      throw err;
    }
  }
  throw lastError instanceof Error?lastError:new Error('FINANCIAL_SCREEN_COMMIT_FAILED');
}
