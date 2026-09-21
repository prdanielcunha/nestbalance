'use client';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from '@/src/lib/firebase/client';
import type { DocumentSignalsResult } from '@/src/core/document-signals';

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

export async function ingestEvidence(householdId: string, file: File, onProgress?: (progress: UploadProgress) => void) {
  if (!storage) throw new Error('STORAGE_NOT_CONFIGURED');
  const started = await api<{evidenceId:string;uploadPath:string}>('/api/evidence/start', {
    householdId, originalName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size
  });
  const objectRef = ref(storage, started.uploadPath);
  const task = uploadBytesResumable(objectRef, file, {
    contentType: file.type,
    customMetadata: { householdId, evidenceId: started.evidenceId }
  });
  await new Promise<void>((resolve, reject) => task.on('state_changed', snapshot => {
    const percent = snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
    onProgress?.({ phase: 'uploading', percent });
  }, reject, () => resolve()));
  onProgress?.({ phase: 'verifying', percent: 100 });
  return api<{status:'accepted'|'duplicate';evidenceId:string;canonicalEvidenceId:string}>('/api/evidence/finalize', {
    householdId, evidenceId: started.evidenceId
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
