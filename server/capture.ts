import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { fingerprintForInterpretation } from '../src/core/fingerprint.js';
import { parseFinancialText } from '../src/core/text-parser.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res: Response, status: number, code: string) { return res.status(status).json({ ok: false, error: code }); }

export async function commitCapture(req: Request, res: Response) {
  try {
    const user = await requireFirebaseUser(req);
    const householdId = String(req.body?.householdId || '');
    await requireHouseholdMember(householdId, user.uid);
    const sourceText = String(req.body?.sourceText || '').trim();
    if (!sourceText || sourceText.length > 8000) return error(res, 400, 'INVALID_CAPTURE_TEXT');
    const observedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.observedOn || '')) ? String(req.body.observedOn) : new Date().toISOString().slice(0,10);
    const interpretation = parseFinancialText(sourceText);
    if (interpretation.needsReview.includes('amount') || interpretation.needsReview.includes('amount_positive')) return error(res, 400, 'AMOUNT_CONFIRMATION_REQUIRED');

    let evidenceId = req.body?.evidenceId ? String(req.body.evidenceId) : null;
    if (evidenceId) {
      const ev = await adminDb.doc(`households/${householdId}/evidenceAssets/${evidenceId}`).get();
      if (!ev.exists) return error(res, 400, 'EVIDENCE_NOT_FOUND');
      const data = ev.data()!;
      if (!['accepted','duplicate'].includes(data.status)) return error(res, 409, 'EVIDENCE_NOT_READY');
      evidenceId = data.canonicalEvidenceId || evidenceId;
    }

    const fingerprint = fingerprintForInterpretation(interpretation, observedOn);
    const target = interpretation.kind === 'commitment' ? 'commitments' : 'transactions';
    const existing = await adminDb.collection('households').doc(householdId).collection(target).where('fingerprint','==',fingerprint).limit(1).get();
    if (!existing.empty) return res.json({ ok: true, status: 'duplicate', id: existing.docs[0].id, evidenceId });

    const ref = adminDb.collection('households').doc(householdId).collection(target).doc();
    const batch = adminDb.batch();
    batch.create(ref, {
      description: interpretation.description,
      amountMinor: interpretation.money.amountMinor,
      currency: interpretation.money.currency,
      direction: interpretation.direction,
      source: 'universal_capture',
      sourceText,
      confidence: interpretation.confidence,
      needsReview: interpretation.needsReview,
      interpretation: { parserVersion: interpretation.parserVersion, fieldConfidence: interpretation.fieldConfidence },
      evidenceIds: evidenceId ? [evidenceId] : [],
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      observedOn: interpretation.kind === 'transaction' ? observedOn : null,
      fingerprint,
      status: interpretation.kind === 'commitment' ? 'pending' : 'confirmed',
      dueDay: interpretation.dueDay ?? null,
      recurring: interpretation.recurring,
      recurrence: interpretation.recurrence ?? null,
      installment: interpretation.installment ?? null
    });
    const audit = adminDb.collection('households').doc(householdId).collection('auditEvents').doc();
    batch.create(audit, { type: 'capture.committed', actorUid: user.uid, entityType: interpretation.kind, entityId: ref.id, evidenceId, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return res.status(201).json({ ok: true, status: 'created', id: ref.id, evidenceId });
  } catch (err: any) {
    return error(res, err.statusCode || 500, ['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'].includes(err.message) ? err.message : 'CAPTURE_COMMIT_FAILED');
  }
}
