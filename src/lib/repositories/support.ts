'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';

async function api<T>(path:string,body:unknown):Promise<T>{
  const token=await getBrowserAuthToken();
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body),cache:'no-store'});
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SUPPORT_REQUEST_FAILED');
  return json as T;
}

export type SupportDiagnostics={
  ok:true;
  diagnosticId:string|null;
  environment:string;
  release:string|null;
  status:'operational';
  capabilities:Record<string,boolean>;
  openFinanceGate:{ready:boolean;exposed:false};
};

export function loadSupportDiagnostics(householdId:string){
  return api<SupportDiagnostics>('/api/support/diagnostics',{householdId});
}

export function loadBetaStatus(householdId:string){
  return api<{ok:true;enrolled:boolean;consentVersion:string;enrolledAt:string|null}>('/api/beta/status',{householdId});
}

export function enrollFamilyBeta(householdId:string){
  return api<{ok:true;enrolled:true;consentVersion:string}>('/api/beta/enroll',{householdId,researchConsent:true});
}

export function pulseFamilyBeta(householdId:string){
  return api<{ok:true;recorded:boolean;weekKey?:string}>('/api/beta/pulse',{householdId});
}
