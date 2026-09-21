'use client';
import { auth } from '@/src/lib/firebase/client';
import type { DocumentSignalsResult } from '@/src/core/document-signals';
import type { AiFinancialExtraction } from '@/src/core/ai-financial';

export type VaultItem = {
  evidenceId:string;
  originalName:string;
  mimeType:string;
  size:number;
  createdAtMs:number|null;
  extractionState:string;
  lastExtractionVersion:string|null;
};

export type VaultDetail = {
  ok:true;
  evidence:VaultItem;
  understood:null|{
    state:string;
    parser:string|null;
    characters:number;
    truncated:boolean;
    aiUsed:boolean;
    ocrUsed:boolean;
    signals:DocumentSignalsResult|null;
    extraction:AiFinancialExtraction|null;
    transcriptPreview:string|null;
    analysisVersion:string|null;
    visionUsed:boolean;
    sttUsed:boolean;
  };
};

async function authHeaders(json=true) {
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  return {
    ...(json?{'content-type':'application/json'}:{}),
    authorization:`Bearer ${token}`
  };
}

export async function listVault(householdId:string) {
  const response=await fetch('/api/vault/list',{
    method:'POST',
    headers:await authHeaders(),
    body:JSON.stringify({householdId}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'VAULT_LIST_FAILED');
  return json as {ok:true;items:VaultItem[]};
}

export async function getVaultDetail(householdId:string,evidenceId:string) {
  const response=await fetch('/api/vault/detail',{
    method:'POST',
    headers:await authHeaders(),
    body:JSON.stringify({householdId,evidenceId}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'VAULT_DETAIL_FAILED');
  return json as VaultDetail;
}

export async function getVaultPreview(householdId:string,evidenceId:string) {
  const response=await fetch('/api/vault/preview',{
    method:'POST',
    headers:await authHeaders(),
    body:JSON.stringify({householdId,evidenceId}),
    cache:'no-store'
  });
  if(!response.ok) {
    const json=await response.json().catch(()=>({}));
    throw new Error(json.error||'VAULT_PREVIEW_FAILED');
  }
  return response.blob();
}
