'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';
import type { FinancialInterpretation } from '@/src/core/types';
import { ingestEvidence, type UploadProgress } from './evidence';
import type { FinancialScope } from '@/src/core/privacy';
import { enqueueCaptureMutation } from '@/src/lib/offline-mutation-queue';
import { publishSyncStatus } from '@/src/features/realtime/sync-status-store';

function localIsoDate() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0,10);
}

export type CommitResult = { status: 'created' | 'duplicate' | 'queued'; id: string; evidenceId?: string | null };

async function commitOnServer(householdId: string, sourceText: string, observedOn: string, evidenceId?: string | null, scope:FinancialScope='household'): Promise<CommitResult> {
  const token = await getBrowserAuthToken();
  const queueIfSafe=async()=>{
    if(evidenceId) throw new Error('CAPTURE_COMMIT_FAILED');
    const queued=await enqueueCaptureMutation({householdId,sourceText,observedOn,scope});
    publishSyncStatus('pending');
    return {status:'queued' as const,id:queued.id,evidenceId:null};
  };

  if(typeof navigator!=='undefined'&&!navigator.onLine) return queueIfSafe();

  try{
    const response = await fetch('/api/capture/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ householdId, sourceText, evidenceId: evidenceId || null, observedOn, scope }),
      cache:'no-store'
    });
    const json = await response.json().catch(() => ({}));
    if(!response.ok) throw Object.assign(new Error(json.error || 'CAPTURE_COMMIT_FAILED'),{httpStatus:response.status});
    return json as CommitResult;
  }catch(error:any){
    const httpStatus=Number(error?.httpStatus||0);
    if(!evidenceId&&(!httpStatus||httpStatus===408||httpStatus===429||httpStatus>=500)){
      return queueIfSafe();
    }
    throw error;
  }
}

export async function commitInterpretation(args: {
  householdId: string;
  uid: string;
  interpretation: FinancialInterpretation;
  file?: File | null;
  evidenceId?: string | null;
  onUploadProgress?: (progress: UploadProgress) => void;
  scope?: FinancialScope;
}): Promise<CommitResult> {
  const { householdId, interpretation, file, onUploadProgress, scope='household' } = args;
  let evidenceId: string | null = args.evidenceId ?? null;
  if (file && !evidenceId) {
    const evidence = await ingestEvidence(householdId, file, onUploadProgress, scope);
    evidenceId = evidence.canonicalEvidenceId;
  }
  return commitOnServer(householdId, interpretation.sourceText, interpretation.occurredOn || localIsoDate(), evidenceId, scope);
}
