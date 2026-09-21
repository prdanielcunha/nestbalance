import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { fingerprintForInterpretation } from '../src/core/fingerprint.js';
import { parseFinancialText } from '../src/core/text-parser.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertCanViewFinancialRecord, normalizeFinancialVisibility, privacyFields } from './privacy.js';

function error(res: Response, status: number, code: string) { return res.status(status).json({ ok: false, error: code }); }

export async function commitCapture(req: Request, res: Response) {
  try {
    const user = await requireFirebaseUser(req);
    const householdId = String(req.body?.householdId || '');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    let visibility=normalizeFinancialVisibility(req.body?.visibility);
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
      assertCanViewFinancialRecord(data,user.uid);
      if (!['accepted','duplicate'].includes(data.status)) return error(res, 409, 'EVIDENCE_NOT_READY');
      const evidenceVisibility=normalizeFinancialVisibility(data.scope);
      if(req.body?.visibility&&evidenceVisibility!==visibility) return error(res,409,'PRIVACY_SCOPE_MISMATCH');
      visibility=evidenceVisibility;
      evidenceId = data.canonicalEvidenceId || evidenceId;
    }

    const fingerprint = fingerprintForInterpretation(interpretation, observedOn);
    const scopedFingerprint=visibility==='personal'?`${fingerprint}|personal|${user.uid}`:fingerprint;
    const fingerprintId = createHash('sha256').update(scopedFingerprint).digest('hex');
    const target = interpretation.kind === 'commitment' ? 'commitments' : 'transactions';
    const entityRef = adminDb.collection('households').doc(householdId).collection(target).doc();
    const fingerprintRef = adminDb.doc(`households/${householdId}/captureFingerprints/${fingerprintId}`);
    const auditRef = adminDb.collection('households').doc(householdId).collection('auditEvents').doc();

    let result: { status: 'created' | 'duplicate'; id: string; evidenceId: string | null } = {
      status: 'created', id: entityRef.id, evidenceId
    };

    await adminDb.runTransaction(async tx => {
      const existing = await tx.get(fingerprintRef);
      if (existing.exists) {
        const data = existing.data()!;
        result = { status: 'duplicate', id: String(data.entityId), evidenceId };
        return;
      }

      tx.create(entityRef, {
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
        ...privacyFields(visibility,user.uid),
        status: interpretation.kind === 'commitment' ? 'pending' : 'confirmed',
        dueDay: interpretation.dueDay ?? null,
        recurring: interpretation.recurring,
        recurrence: interpretation.recurrence ?? null,
        installment: interpretation.installment ?? null
      });
      tx.create(fingerprintRef, {
        entityType: interpretation.kind,
        entityId: entityRef.id,
        fingerprint:scopedFingerprint,
        scope:visibility,
        ownerUid:visibility==='personal'?user.uid:null,
        createdAt: FieldValue.serverTimestamp()
      });
      tx.create(auditRef, {
        type: 'capture.committed',
        actorUid: user.uid,
        entityType: interpretation.kind,
        entityId: entityRef.id,
        evidenceId,
        createdAt: FieldValue.serverTimestamp()
      });
    });

    return res.status(result.status === 'created' ? 201 : 200).json({ ok: true, ...result });
  } catch (err: any) {
    return error(res, err.statusCode || 500, ['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','FINANCIAL_PRIVACY_DENIED'].includes(err.message) ? err.message : 'CAPTURE_COMMIT_FAILED');
  }
}
