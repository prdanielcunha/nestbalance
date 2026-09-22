'use client';
import { auth } from '@/src/lib/firebase/client';

async function token(){
  const value=await auth?.currentUser?.getIdToken();
  if(!value) throw new Error('AUTH_REQUIRED');
  return value;
}

export async function dismissAttention(input:{
  householdId:string;
  attentionKey:string;
  snoozeDays?:number;
}){
  const response=await fetch('/api/attention/dismiss',{
    method:'POST',
    headers:{
      authorization:`Bearer ${await token()}`,
      'content-type':'application/json'
    },
    body:JSON.stringify(input),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'ATTENTION_DISMISS_FAILED');
  return json as {ok:true;attentionKey:string;expiresAtMs:number};
}
