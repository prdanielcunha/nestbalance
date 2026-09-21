'use client';
import { auth } from '@/src/lib/firebase/client';

async function token(){
  const value=await auth?.currentUser?.getIdToken();
  if(!value) throw new Error('AUTH_REQUIRED');
  return value;
}

export async function bootstrapSession(){
  const response=await fetch('/api/session/bootstrap',{
    method:'POST',
    headers:{authorization:`Bearer ${await token()}`},
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SESSION_BOOTSTRAP_FAILED');
  return json as {ok:true;householdId:string;created:boolean};
}
