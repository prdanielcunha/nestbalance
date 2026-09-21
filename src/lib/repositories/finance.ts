'use client';
import { auth } from '@/src/lib/firebase/client';
import type { FinancialInterpretation } from '@/src/core/types';
import { ingestEvidence, type UploadProgress } from './evidence';
import type { FinancialScope } from '@/src/core/privacy';

function localIsoDate() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0,10);
}

export type CommitResult = { status: 'created' | 'duplicate'; id: string; evidenceId?: string | null };

async function commitOnServer(householdId: string, sourceText: string, observedOn: string, evidenceId?: string | null, scope:FinancialScope='household'): Promise<CommitResult> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch('/api/capture/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ householdId, sourceText, evidenceId: evidenceId || null, observedOn, scope })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'CAPTURE_COMMIT_FAILED');
  return json as CommitResult;
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
