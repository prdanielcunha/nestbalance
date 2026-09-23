'use client';
import { auth } from '@/src/lib/firebase/client';

export async function loadHouseholdRevision(householdId:string){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  const response=await fetch('/api/household/revision',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'HOUSEHOLD_REVISION_FAILED');
  return String(json.revision||'0');
}
