'use client';
import { auth } from '@/src/lib/firebase/client';
import { getNestBalanceDeviceContext } from '@/src/lib/device-context';

async function token(){
  const value=await auth?.currentUser?.getIdToken();
  if(!value) throw new Error('AUTH_REQUIRED');
  return value;
}
async function post<T>(path:string,body:Record<string,unknown>):Promise<T>{
  const response=await fetch(path,{
    method:'POST',
    headers:{authorization:`Bearer ${await token()}`,'content-type':'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SECURITY_REQUEST_FAILED');
  return json as T;
}

export type SecurityDevice={
  id:string;
  label:string;
  firstSeenAtMs:number|null;
  lastSeenAtMs:number|null;
  revokedAtMs:number|null;
  current:boolean;
};

export function loadSecurityDevices(){
  return post<{ok:true;devices:SecurityDevice[]}>('/api/security/devices',{device:getNestBalanceDeviceContext()});
}

export function revokeAllNestBalanceSessions(){
  return post<{ok:true;revokedBeforeSeconds:number}>('/api/security/revoke-sessions',{});
}
