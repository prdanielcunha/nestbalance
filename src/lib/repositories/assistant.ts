'use client';
import { auth } from '@/src/lib/firebase/client';
import type { AssistantAnswer } from '@/src/core/assistant';
import type { FinancialView } from '@/src/features/privacy/scope-view-switch';
import type { Locale } from '@/src/i18n/messages';

export type AssistantAnswerResponse={
  ok:true;
  answer:AssistantAnswer;
  grounded:true;
  asOf:string;
};

export async function askFinanceAssistant(householdId:string,question:string,view:FinancialView='household',locale:Locale='pt-BR'){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');

  const response=await fetch('/api/assistant/answer',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId,question,view,locale}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'ASSISTANT_ANSWER_FAILED');
  return json as AssistantAnswerResponse;
}
