'use client';
import { auth } from '@/src/lib/firebase/client';
import type { DocumentSignalsResult } from '@/src/core/document-signals';
import type { AiFinancialExtraction } from '@/src/core/ai-financial';
import type { FinancialInterpretation } from '@/src/core/types';
import type { ImportedMovementList } from '@/src/core/movement-import';
import type { FinancialScope } from '@/src/core/privacy';

export type UploadProgress = { phase: 'uploading' | 'verifying'; percent: number };

async function api<T>(path: string, body: unknown): Promise<T> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'REQUEST_FAILED');
  return json as T;
}

export async function ingestEvidence(householdId: string, file: File, onProgress?: (progress: UploadProgress) => void, scope:FinancialScope='household') {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const started = await api<{evidenceId:string}>('/api/evidence/start', {
    householdId, scope, originalName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size
  });

  return new Promise<{status:'accepted'|'duplicate';evidenceId:string;canonicalEvidenceId:string}>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST','/api/evidence/upload');
    xhr.setRequestHeader('Authorization',`Bearer ${token}`);
    xhr.setRequestHeader('X-NestBalance-Household-Id',householdId);
    xhr.setRequestHeader('X-NestBalance-Evidence-Id',started.evidenceId);
    xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');
    xhr.responseType='json';
    xhr.upload.onprogress=event=>{
      const percent=event.lengthComputable&&event.total>0?Math.round((event.loaded/event.total)*100):0;
      onProgress?.({phase:'uploading',percent});
    };
    xhr.upload.onload=()=>onProgress?.({phase:'verifying',percent:100});
    xhr.onerror=()=>reject(new Error('EVIDENCE_UPLOAD_FAILED'));
    xhr.onload=()=>{
      const json=xhr.response||{};
      if(xhr.status<200||xhr.status>=300){
        reject(new Error(json.error||'EVIDENCE_UPLOAD_FAILED'));
        return;
      }
      resolve(json);
    };
    xhr.send(file);
  });
}

export type EvidenceTextAnalysis = {
  state:'extracted'|'needs_ai'|'unavailable';
  parser:string|null;
  reason:string|null;
  text:string|null;
  characters:number;
  truncated:boolean;
  totalPages:number|null;
  extractedPages:number|null;
  signals:DocumentSignalsResult;
};

export async function analyzeEvidenceText(householdId:string,evidenceId:string) {
  return api<EvidenceTextAnalysis>('/api/evidence/analyze-text',{householdId,evidenceId});
}

export type AiEvidenceAnalysis = {
  ok:true;
  state:'extracted';
  kind:'image'|'audio';
  analysisVersion:string;
  model:string;
  extraction:AiFinancialExtraction|null;
  transcript:string|null;
  transcriptTruncated:boolean;
  parsedInterpretations:FinancialInterpretation[]|null;
  movementList:ImportedMovementList|null;
};

export async function analyzeEvidenceAi(householdId:string,evidenceId:string) {
  return api<AiEvidenceAnalysis>('/api/evidence/analyze-ai',{householdId,evidenceId});
}
