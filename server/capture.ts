import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { fingerprintForInterpretation } from '../src/core/fingerprint.js';
import { parseFinancialText } from '../src/core/text-parser.js';
import { applyReviewedInterpretation } from '../src/core/capture-review.js';
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
    const parsedInterpretation = parseFinancialText(sourceText);
    const reviewed=applyReviewedInterpretation(parsedInterpretation,req.body?.reviewed);
    if(!reviewed.ok) return error(res,400,reviewed.reason);
    const interpretation=reviewed.value;
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
    const fingerprint = fingerprintForInterpretation(interpretation, observedOn);
    const fingerprintId = createHash('sha256').update(privacy.scope+'|'+(privacy.ownerUid||'')+'|'+fingerprint).digest('hex');
    const target = interpretation.kind === 'commitment' ? 'commitments' : 'transactions';
    const entityRef = household.collection(target).doc();
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
        scope:privacy.scope,
        ownerUid:privacy.ownerUid,
        amountMinor: interpretation.money.amountMinor,
        currency: interpretation.money.currency,
        direction: interpretation.direction,
        source: 'universal_capture',
        sourceText,
        confidence: interpretation.confidence,
        needsReview: interpretation.needsReview,
        humanReviewed:Boolean(req.body?.reviewed),
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

function timestampMillis(value:any){
  if(value&&typeof value.toMillis==='function') return Number(value.toMillis())||0;
  if(value instanceof Date) return value.getTime();
  if(typeof value==='number') return Number.isFinite(value)?value:0;
  return 0;
}

export async function undoCapture(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
    const items=rawItems.slice(0,50).map((item:any)=>({
      id:String(item?.id||''),
      entityType:item?.entityType==='commitment'?'commitment':'transaction'
    }));
    if(!items.length||items.some(item=>!/^[A-Za-z0-9_-]{6,128}$/.test(item.id))) return error(res,400,'INVALID_CAPTURE_UNDO');

    const household=adminDb.collection('households').doc(householdId);
    const entries=items.map(item=>({
      ...item,
      ref:household.collection(item.entityType==='commitment'?'commitments':'transactions').doc(item.id)
    }));
    const auditRef=household.collection('auditEvents').doc();
    let undone=0;

    await adminDb.runTransaction(async tx=>{
      const records:Array<{entry:(typeof entries)[number];data:any}>=[];
      for(const entry of entries){
        const snap=await tx.get(entry.ref);
        if(!snap.exists) continue;
        const data=snap.data()||{};
        if(data.source!=='universal_capture'||data.createdBy!==user.uid) throw Object.assign(new Error('CAPTURE_UNDO_DENIED'),{statusCode:403});
        const createdAtMs=timestampMillis(data.createdAt);
        if(!createdAtMs||Date.now()-createdAtMs>10*60_000) throw Object.assign(new Error('CAPTURE_UNDO_EXPIRED'),{statusCode:409});
        records.push({entry,data});
      }

      for(const {entry,data} of records){
        const scope=data.scope==='personal'?'personal':'household';
        const ownerUid=scope==='personal'?String(data.ownerUid||user.uid):'';
        const fingerprint=String(data.fingerprint||'');
        tx.delete(entry.ref);
        if(fingerprint){
          const fingerprintId=createHash('sha256').update(scope+'|'+ownerUid+'|'+fingerprint).digest('hex');
          tx.delete(household.collection('captureFingerprints').doc(fingerprintId));
        }
        undone++;
      }

      tx.create(auditRef,{
        type:'capture.undone',
        actorUid:user.uid,
        entityType:'capture_batch',
        entityIds:records.map(record=>record.entry.id),
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json({ok:true,undone});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','CAPTURE_UNDO_DENIED','CAPTURE_UNDO_EXPIRED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'CAPTURE_UNDO_FAILED');
  }
}
