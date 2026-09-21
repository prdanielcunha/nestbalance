'use client';
import { addDoc, collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '@/src/lib/firebase/client';
import type { FinancialInterpretation } from '@/src/core/types';
import { fingerprintForInterpretation } from '@/src/core/fingerprint';

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2,'0')).join('');
}

function localIsoDate() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0,10);
}

export type CommitResult = { status: 'created' | 'duplicate'; id: string; evidenceId?: string | null };

export async function commitInterpretation(args: { householdId: string; uid: string; interpretation: FinancialInterpretation; file?: File | null; }): Promise<CommitResult> {
  if (!db) throw new Error('FIREBASE_NOT_CONFIGURED');
  const { householdId, uid, interpretation, file } = args;
  const today = localIsoDate();
  const fingerprint = fingerprintForInterpretation(interpretation, today);
  const target = interpretation.kind === 'commitment' ? 'commitments' : 'transactions';

  const exactExisting = await getDocs(query(collection(db, 'households', householdId, target), where('fingerprint','==',fingerprint), limit(1)));
  if (!exactExisting.empty) return { status: 'duplicate', id: exactExisting.docs[0].id };

  let evidenceId: string | null = null;
  if (file) {
    if (!storage) throw new Error('STORAGE_NOT_CONFIGURED');
    const hash = await sha256(file);
    const evidenceExisting = await getDocs(query(collection(db, 'households', householdId, 'evidenceAssets'), where('sha256','==',hash), limit(1)));
    if (!evidenceExisting.empty) {
      evidenceId = evidenceExisting.docs[0].id;
      for (const collectionName of ['transactions','commitments'] as const) {
        const linked = await getDocs(query(collection(db, 'households', householdId, collectionName), where('evidenceIds','array-contains',evidenceId), limit(1)));
        if (!linked.empty) return { status: 'duplicate', id: linked.docs[0].id, evidenceId };
      }
    } else {
      const evidenceRef = doc(collection(db, 'households', householdId, 'evidenceAssets'));
      evidenceId = evidenceRef.id;
      const path = `nestbalance/households/${householdId}/evidence/${evidenceId}/original`;
      const task = uploadBytesResumable(ref(storage, path), file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: { householdId, evidenceId, uploaderUid: uid, sha256: hash }
      });
      await new Promise<void>((resolve, reject) => task.on('state_changed', undefined, reject, () => resolve()));
      await setDoc(evidenceRef, {
        id: evidenceId, storagePath: path, sha256: hash, originalName: file.name, mimeType: file.type,
        size: file.size, uploadedBy: uid, createdAt: serverTimestamp(), immutable: true
      });
      await setDoc(doc(db, 'households', householdId, 'evidenceAssets', evidenceId, 'extractions', interpretation.parserVersion), {
        extractor: interpretation.parserVersion,
        fieldConfidence: interpretation.fieldConfidence,
        structured: interpretation,
        createdAt: serverTimestamp()
      });
    }
  }

  const base = {
    description: interpretation.description,
    amountMinor: interpretation.money.amountMinor,
    currency: interpretation.money.currency,
    direction: interpretation.direction,
    source: 'universal_capture',
    sourceText: interpretation.sourceText,
    confidence: interpretation.confidence,
    needsReview: interpretation.needsReview,
    interpretation: { parserVersion: interpretation.parserVersion, fieldConfidence: interpretation.fieldConfidence },
    evidenceIds: evidenceId ? [evidenceId] : [],
    createdBy: uid,
    createdAt: serverTimestamp(),
    observedOn: interpretation.kind === 'transaction' ? today : null,
    fingerprint
  };

  const created = await addDoc(collection(db, 'households', householdId, target), {
    ...base,
    status: interpretation.kind === 'commitment' ? 'pending' : 'confirmed',
    dueDay: interpretation.dueDay ?? null,
    recurring: interpretation.recurring,
    recurrence: interpretation.recurrence ?? null,
    installment: interpretation.installment ?? null
  });
  await addDoc(collection(db, 'households', householdId, 'auditEvents'), {
    type: 'capture.committed', actorUid: uid, entityType: interpretation.kind, entityId: created.id,
    evidenceId, createdAt: serverTimestamp()
  });
  return { status: 'created', id: created.id, evidenceId };
}
