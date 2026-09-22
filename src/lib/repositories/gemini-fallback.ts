'use client';
import { auth } from '@/src/lib/firebase/client';
import type { AiFinancialExtraction } from '@/src/core/ai-financial';

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
  if(!response.ok) throw new Error(json.error||'GEMINI_FREE_REQUEST_FAILED');
  return json as T;
}

export type GeminiFallbackStatus={
  ok:true;
  configured:boolean;
  provider:'gemini_free_redacted_text';
  model:string;
  consentVersion:string;
  imageSent:false;
  dailyCap:number;
};

export function getGeminiFallbackStatus(householdId:string){
  return api<GeminiFallbackStatus>('/api/ai/gemini/status',{householdId});
}

export function analyzeTextWithGeminiFallback(input:{
  householdId:string;
  text:string;
  consentVersion:string;
}){
  return api<{
    ok:true;
    provider:'gemini_free_redacted_text';
    model:string;
    extraction:AiFinancialExtraction;
    privacy:{
      imageSent:false;
      textRedacted:true;
      redactionCount:number;
      truncated:boolean;
      consentVersion:string;
    };
    quota:{dailyCap:number};
  }>('/api/ai/gemini/analyze-text',{
    householdId:input.householdId,
    text:input.text,
    consentAccepted:true,
    consentVersion:input.consentVersion
  });
}
