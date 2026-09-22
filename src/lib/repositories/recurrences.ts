'use client';
import { auth } from '@/src/lib/firebase/client';

async function post(path:string,payload:Record<string,unknown>){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  const response=await fetch(path,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(payload),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'RECURRENCE_ACTION_FAILED');
  return json;
}

export function confirmRecurringSuggestion(input:{householdId:string;referenceTransactionId:string}){
  return post('/api/recurrences/confirm',input);
}

export function dismissRecurringSuggestion(input:{householdId:string;referenceTransactionId:string}){
  return post('/api/recurrences/dismiss',input);
}
