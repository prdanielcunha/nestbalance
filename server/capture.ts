import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { fingerprintForInterpretation } from '../src/core/fingerprint.js';
import { parseFinancialText } from '../src/core/text-parser.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertScopedAccess, scopeFields } from './privacy.js';
import { learnedCategoryForDescription } from './category-rules.js';

function error(res: Response, status: number, code: string) { return res.status(status).json({ ok: false, error: code }); }

export async function commitCapture(req: Request, res: Response) {
  try {
    const user = await requireFirebaseUser(req);
    const householdId = String(req.body?.householdId || '');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    const privacy=scopeFields(req.body?.scope,user.uid);
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
      assertScopedAccess(data,user.uid);
      const evidenceScope=data.scope==='personal'?'personal':'household';
      if(evidenceScope!==privacy.scope) return error(res,409,'PRIVACY_SCOPE_MISMATCH');
      if (!['accepted','duplicate'].includes(data.status)) return error(res, 409, 'EVIDENCE_NOT_READY');
      evidenceId = data.canonicalEvidenceId || evidenceId;
    }

    const household=adminDb.collection('households').doc(householdId);
    const learnedCategory=interpretation.kind==='transaction'&&interpretation.direction==='expense'
      ? await learnedCategoryForDescription(household,privacy.scope,privacy.ownerUid,interpretation.description)
      : null;
    const accountId=String(req.body?.accountId||'');
    let sourceAccountLabel:string|null=null;
    let institutionName=String(req.body?.institutionName||'').normalize('NFKC').trim().slice(0,120)||null;
    if(accountId){
      if(!/^[A-Za-z0-9_-]{6,128}$/.test(accountId)) return error(res,400,'INVALID_ACCOUNT');
      const account=await household.collection('accounts').doc(accountId).get();
      if(!account.exists) return error(res,404,'ACCOUNT_NOT_FOUND');
      const data=account.data()!;assertScopedAccess(data,user.uid);
      if((data.scope||'household')!==privacy.scope||data.status!=='active') return error(res,409,'PRIVACY_SCOPE_MISMATCH');
      institutionName=typeof data.institutionName==='string'?data.institutionName:null;
      sourceAccountLabel=String(data.name||'')+(data.last4?' · '+String(data.last4):'');
    }
    const requestId=String(req.body?.requestId||'');
    const separate=req.body?.keepSeparate===true;
    if(separate&&!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) return error(res,400,'INVALID_CAPTURE_REQUEST');
    const fingerprint = fingerprintForInterpretation(interpretation, observedOn,accountId||institutionName?.toLowerCase());
    const fingerprintId = createHash('sha256').update(privacy.scope+'|'+(privacy.ownerUid||'')+'|'+fingerprint+(separate?'|distinct|'+requestId:'')).digest('hex');
    const target = interpretation.kind === 'commitment' ? 'commitments' : 'transactions';
    const existingMovementId=String(req.body?.existingMovementId||'');
    if(existingMovementId&&!/^[A-Za-z0-9_-]{6,128}$/.test(existingMovementId)) return error(res,400,'INVALID_CAPTURE_REQUEST');
    const entityRef = household.collection(target).doc();
    const fingerprintRef = adminDb.doc(`households/${householdId}/captureFingerprints/${fingerprintId}`);
    const auditRef = adminDb.collection('households').doc(householdId).collection('auditEvents').doc();

    let result: { status: 'created' | 'duplicate'; id: string; evidenceId: string | null } = {
      status: 'created', id: entityRef.id, evidenceId
    };

    await adminDb.runTransaction(async tx => {
      if(existingMovementId){
        const linkedRef=household.collection(target).doc(existingMovementId);
        const linked=await tx.get(linkedRef);
        if(!linked.exists) throw Object.assign(new Error('CAPTURE_RECORD_MISSING'),{statusCode:409});
        const data=linked.data()!;assertScopedAccess(data,user.uid);
        if((data.scope||'household')!==privacy.scope||data.amountMinor!==interpretation.money.amountMinor||data.currency!==interpretation.money.currency||data.direction!==interpretation.direction||(data.status==='cancelled')) throw Object.assign(new Error('CAPTURE_MATCH_CONFLICT'),{statusCode:409});
        if((accountId&&data.accountId&&accountId!==data.accountId)||(institutionName&&data.institutionName&&interpretation.direction!=='transfer'&&institutionName.toLowerCase()!==String(data.institutionName).toLowerCase())) throw Object.assign(new Error('CAPTURE_MATCH_CONFLICT'),{statusCode:409});
        tx.update(linkedRef,{...(evidenceId?{evidenceIds:FieldValue.arrayUnion(evidenceId)}:{}),updatedAt:FieldValue.serverTimestamp()});
        tx.create(auditRef,{type:'capture.evidence_linked',scope:privacy.scope,ownerUid:privacy.ownerUid,actorUid:user.uid,entityType:interpretation.kind,entityId:linkedRef.id,evidenceId,createdAt:FieldValue.serverTimestamp()});
        result={status:'duplicate',id:linkedRef.id,evidenceId};return;
      }
      let existing = await tx.get(fingerprintRef);
      // Honor fingerprints written before direction became part of identity.
      // This compatibility lookup applies only when no bank/account is known.
      if(!existing.exists&&!separate&&!accountId&&!institutionName){
        const legacy=fingerprint.split('|').filter((_,index)=>index!==1).join('|');
        const legacyId=createHash('sha256').update(privacy.scope+'|'+(privacy.ownerUid||'')+'|'+legacy).digest('hex');
        const old=await tx.get(household.collection('captureFingerprints').doc(legacyId));
        if(old.exists) existing=old;
      }
      if (existing.exists) {
        const data = existing.data()!;
        const existingRef=household.collection(target).doc(String(data.entityId));
        const existingRecord=await tx.get(existingRef);
        if(!existingRecord.exists) throw Object.assign(new Error('CAPTURE_RECORD_MISSING'),{statusCode:409});
        assertScopedAccess(existingRecord.data()!,user.uid);
        if(existingRecord.data()?.direction!==interpretation.direction) throw Object.assign(new Error('CAPTURE_MATCH_CONFLICT'),{statusCode:409});
        if(evidenceId) tx.update(existingRef,{evidenceIds:FieldValue.arrayUnion(evidenceId),updatedAt:FieldValue.serverTimestamp()});
        result = { status: 'duplicate', id: String(data.entityId), evidenceId };
        return;
      }

      tx.create(entityRef, {
        description: interpretation.description,
        scope:privacy.scope,
        ownerUid:privacy.ownerUid,
        amountMinor: interpretation.money.amountMinor,
        currency: interpretation.money.currency,
        direction: interpretation.direction,
        source: 'universal_capture',
        accountId:accountId||null,
        institutionName,
        sourceAccountLabel,
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
        installment: interpretation.installment ?? null,
        category:learnedCategory,
        categorySource:learnedCategory?'learned':null
      });
      tx.create(fingerprintRef, {
        entityType: interpretation.kind,
        entityId: entityRef.id,
        fingerprint,
        createdAt: FieldValue.serverTimestamp()
      });
      tx.create(auditRef, {
        type: 'capture.committed',
        scope:privacy.scope,
        actorUid: user.uid,
        entityType: interpretation.kind,
        entityId: entityRef.id,
        evidenceId,
        createdAt: FieldValue.serverTimestamp()
      });
    });

    return res.status(result.status === 'created' ? 201 : 200).json({ ok: true, ...result });
  } catch (err: any) {
    return error(res, err.statusCode || 500, ['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'].includes(err.message) ? err.message : 'CAPTURE_COMMIT_FAILED');
  }
}
