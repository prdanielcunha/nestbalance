import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { MAX_EVIDENCE_BYTES, signatureMatchesMime, validateEvidenceDeclaration } from '../src/core/evidence.js';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

const now = () => FieldValue.serverTimestamp();

function error(res: Response, status: number, code: string) {
  return res.status(status).json({ ok: false, error: code });
}

export async function startEvidence(req: Request, res: Response) {
  try {
    const user = await requireFirebaseUser(req);
    const householdId = String(req.body?.householdId || '');
    await requireHouseholdMember(householdId, user.uid);
    const validation = validateEvidenceDeclaration({
      originalName: String(req.body?.originalName || ''),
      mimeType: String(req.body?.mimeType || ''),
      size: Number(req.body?.size || 0)
    });
    if (!validation.ok) return error(res, 400, validation.reason);

    const evidenceRef = adminDb.collection('households').doc(householdId).collection('evidenceAssets').doc();
    const uploadPath = `nestbalance/households/${householdId}/evidence/${evidenceRef.id}/original`;
    await evidenceRef.create({
      id: evidenceRef.id,
      status: 'awaiting_upload',
      immutable: false,
      uploadedBy: user.uid,
      originalName: validation.normalizedName,
      declaredMimeType: validation.mimeType,
      declaredSize: validation.size,
      uploadPath,
      createdAt: now(),
      schemaVersion: 1
    });
    return res.status(201).json({ ok: true, evidenceId: evidenceRef.id, uploadPath });
  } catch (err: any) {
    return error(res, err.statusCode || 500, err.message === 'AUTH_REQUIRED' || err.message === 'INVALID_SESSION' || err.message === 'HOUSEHOLD_ACCESS_DENIED' ? err.message : 'EVIDENCE_START_FAILED');
  }
}

async function readAndVerifyObject(path: string, mimeType: string, expectedSize: number) {
  const file = adminBucket.file(path);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size || 0);
  if (!size || size > MAX_EVIDENCE_BYTES || size !== expectedSize) throw Object.assign(new Error('FILE_SIZE_MISMATCH'), { statusCode: 400 });
  if ((metadata.contentType || '') !== mimeType) throw Object.assign(new Error('FILE_TYPE_MISMATCH'), { statusCode: 400 });

  const hash = createHash('sha256');
  const head: Buffer[] = [];
  let headSize = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = file.createReadStream();
    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      if (headSize < 4096) {
        const wanted = chunk.subarray(0, Math.max(0, 4096 - headSize));
        head.push(wanted); headSize += wanted.length;
      }
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  const headBytes = new Uint8Array(Buffer.concat(head));
  if (!signatureMatchesMime(mimeType, headBytes)) throw Object.assign(new Error('FILE_SIGNATURE_MISMATCH'), { statusCode: 400 });
  return { sha256: hash.digest('hex'), size };
}

export async function finalizeEvidence(req: Request, res: Response) {
  try {
    const user = await requireFirebaseUser(req);
    const householdId = String(req.body?.householdId || '');
    const evidenceId = String(req.body?.evidenceId || '');
    await requireHouseholdMember(householdId, user.uid);
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(evidenceId)) return error(res, 400, 'INVALID_EVIDENCE');

    const evidenceRef = adminDb.doc(`households/${householdId}/evidenceAssets/${evidenceId}`);
    const snap = await evidenceRef.get();
    if (!snap.exists) return error(res, 404, 'EVIDENCE_NOT_FOUND');
    const evidence = snap.data()!;
    if (evidence.uploadedBy !== user.uid) return error(res, 403, 'EVIDENCE_OWNER_MISMATCH');
    if (evidence.status === 'accepted' || evidence.status === 'duplicate') {
      return res.json({ ok: true, status: evidence.status, evidenceId, canonicalEvidenceId: evidence.canonicalEvidenceId || evidenceId });
    }
    if (evidence.status !== 'awaiting_upload') return error(res, 409, 'EVIDENCE_NOT_FINALIZABLE');

    const verified = await readAndVerifyObject(evidence.uploadPath, evidence.declaredMimeType, evidence.declaredSize);
    const hashRef = adminDb.doc(`households/${householdId}/evidenceHashes/${verified.sha256}`);
    let result: { status: 'accepted' | 'duplicate'; canonicalEvidenceId: string } = { status: 'accepted', canonicalEvidenceId: evidenceId };

    await adminDb.runTransaction(async tx => {
      const freshEvidence = await tx.get(evidenceRef);
      if (!freshEvidence.exists) throw Object.assign(new Error('EVIDENCE_NOT_FOUND'), { statusCode: 404 });
      const current = freshEvidence.data()!;
      if (current.status === 'accepted' || current.status === 'duplicate') {
        result = { status: current.status, canonicalEvidenceId: current.canonicalEvidenceId || evidenceId };
        return;
      }
      const existingHash = await tx.get(hashRef);
      if (existingHash.exists) {
        const canonicalEvidenceId = String(existingHash.data()?.evidenceId || '');
        result = { status: 'duplicate', canonicalEvidenceId };
        tx.update(evidenceRef, {
          status: 'duplicate', immutable: true, sha256: verified.sha256, verifiedSize: verified.size,
          canonicalEvidenceId, finalizedAt: now(), uploadPath: FieldValue.delete()
        });
      } else {
        tx.create(hashRef, { evidenceId, createdAt: now() });
        tx.update(evidenceRef, {
          status: 'accepted', immutable: true, sha256: verified.sha256, verifiedSize: verified.size,
          mimeType: current.declaredMimeType, storagePath: current.uploadPath, finalizedAt: now(), extractionState: 'pending'
        });
      }
      const auditRef = adminDb.collection('households').doc(householdId).collection('auditEvents').doc();
      tx.create(auditRef, { type: `evidence.${result.status}`, actorUid: user.uid, evidenceId, canonicalEvidenceId: result.canonicalEvidenceId, createdAt: now() });
    });

    if (result.status === 'duplicate' && result.canonicalEvidenceId !== evidenceId) {
      await adminBucket.file(evidence.uploadPath).delete({ ignoreNotFound: true }).catch(() => undefined);
    }
    return res.json({ ok: true, status: result.status, evidenceId, canonicalEvidenceId: result.canonicalEvidenceId });
  } catch (err: any) {
    return error(res, err.statusCode || 500, ['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','FILE_SIZE_MISMATCH','FILE_TYPE_MISMATCH','FILE_SIGNATURE_MISMATCH'].includes(err.message) ? err.message : 'EVIDENCE_FINALIZE_FAILED');
  }
}
