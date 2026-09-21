import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { buildInvoiceVisionPreview } from '../src/core/invoice-vision.js';
import { extractCardStatementImage } from './ai/card-statement-image.js';
import { isOpenAiConfigured } from './ai/openai-client.js';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { verifyVaultPreviewBytes } from './vault-verifier.js';

const ANALYSIS_VERSION='invoice-vision-v1';
const extractionDocumentId=(cardId:string)=>`${ANALYSIS_VERSION}-${cardId}`;
const LOCK_TTL_MS=2*60*1000;

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function validId(value:string){
  return /^[A-Za-z0-9_-]{6,128}$/.test(value);
}

function referenceDateFrom(req:Request){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.referenceDate||''))
    ? String(req.body.referenceDate)
    : new Date().toISOString().slice(0,10);
}

async function resolveEvidence(householdId:string,evidenceId:string){
  if(!validId(evidenceId)) return null;
  let ref=adminDb.doc(`households/${householdId}/evidenceAssets/${evidenceId}`);
  let snap=await ref.get();
  if(!snap.exists) return null;
  let data=snap.data()!;
  if(data.status==='duplicate'&&data.canonicalEvidenceId){
    evidenceId=String(data.canonicalEvidenceId);
    ref=adminDb.doc(`households/${householdId}/evidenceAssets/${evidenceId}`);
    snap=await ref.get();
    if(!snap.exists) return null;
    data=snap.data()!;
  }
  if(data.status!=='accepted'||data.immutable!==true) return null;
  return {evidenceId,ref,data};
}

function publicCard(id:string,data:any){
  return {
    id,
    name:String(data.name||'Cartão'),
    brand:String(data.brand||'other'),
    closingDay:Number(data.closingDay),
    dueDay:Number(data.dueDay),
    last4:typeof data.last4==='string'?data.last4:null
  };
}

export async function analyzeCreditCardInvoiceImage(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  let lockRef:DocumentReference|null=null;
  let requestId='';

  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const cardId=String(req.body?.cardId||'');
    const requestedEvidenceId=String(req.body?.evidenceId||'');
    const referenceDate=referenceDateFrom(req);

    await requireHouseholdMember(householdId,user.uid,'manage_finance');
    if(!validId(cardId)) return error(res,400,'INVALID_CARD');
    if(!isOpenAiConfigured()) return error(res,503,'AI_NOT_CONFIGURED');

    const household=adminDb.collection('households').doc(householdId);
    const [cardSnap,resolved]=await Promise.all([
      household.collection('creditCards').doc(cardId).get(),
      resolveEvidence(householdId,requestedEvidenceId)
    ]);

    if(!cardSnap.exists) return error(res,404,'CARD_NOT_FOUND');
    const card=cardSnap.data()!;
    if(card.status!=='active') return error(res,409,'CARD_NOT_ACTIVE');
    if(!resolved) return error(res,404,'EVIDENCE_NOT_FOUND');

    const closingDay=Number(card.closingDay);
    const dueDay=Number(card.dueDay);
    if(!Number.isInteger(closingDay)||!Number.isInteger(dueDay)) return error(res,409,'CARD_CYCLE_INVALID');

    const mimeType=String(resolved.data.mimeType||resolved.data.declaredMimeType||'');
    if(!mimeType.startsWith('image/')) return error(res,400,'INVOICE_IMAGE_TYPE_REQUIRED');

    const extractionRef=resolved.ref.collection('extractions').doc(extractionDocumentId(cardId));
    const existing=await extractionRef.get();
    if(existing.exists){
      const data=existing.data()!;
      return res.json({
        ok:true,
        evidenceId:resolved.evidenceId,
        card:publicCard(cardId,card),
        preview:data.preview,
        model:data.model,
        analysisVersion:ANALYSIS_VERSION
      });
    }

    const activeLockRef=resolved.ref.collection('analysisLocks').doc(extractionDocumentId(cardId));
    lockRef=activeLockRef;
    requestId=randomUUID();
    const nowMs=Date.now();
    let acquired=false;
    let raced:any=null;

    await adminDb.runTransaction(async tx=>{
      const [fresh,lock]=await Promise.all([tx.get(extractionRef),tx.get(activeLockRef)]);
      if(fresh.exists){
        raced=fresh.data();
        return;
      }
      const lockData=lock.exists?lock.data():null;
      if(lockData&&Number(lockData.expiresAtMs||0)>nowMs) return;
      tx.set(activeLockRef,{
        requestId,
        actorUid:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        expiresAtMs:nowMs+LOCK_TTL_MS
      });
      acquired=true;
    });

    if(raced){
      return res.json({
        ok:true,
        evidenceId:resolved.evidenceId,
        card:publicCard(cardId,card),
        preview:raced.preview,
        model:raced.model,
        analysisVersion:ANALYSIS_VERSION
      });
    }
    if(!acquired) return error(res,409,'AI_ANALYSIS_IN_PROGRESS');

    const storagePath=String(resolved.data.storagePath||'');
    if(!storagePath) throw Object.assign(new Error('EVIDENCE_STORAGE_UNAVAILABLE'),{statusCode:409});
    const [bytes]=await adminBucket.file(storagePath).download();
    const verification=verifyVaultPreviewBytes({
      size:Number(resolved.data.verifiedSize||0),
      mimeType,
      sha256:String(resolved.data.sha256||'')
    },bytes);
    if(!verification.ok) throw Object.assign(new Error(`EVIDENCE_${verification.reason.toUpperCase()}`),{statusCode:409});

    const result=await extractCardStatementImage(bytes,mimeType);
    const preview=buildInvoiceVisionPreview({
      extraction:result.extraction,
      closingDay,
      dueDay,
      referenceDate
    });

    const persisted={
      version:1,
      analysisVersion:ANALYSIS_VERSION,
      evidenceId:resolved.evidenceId,
      cardId,
      state:'extracted',
      kind:'card_statement_image',
      model:result.model,
      preview,
      extraction:result.extraction,
      deterministic:false,
      aiUsed:true,
      visionUsed:true,
      createdAt:FieldValue.serverTimestamp()
    };

    const auditRef=household.collection('auditEvents').doc();
    let finalData:any=persisted;
    await adminDb.runTransaction(async tx=>{
      const fresh=await tx.get(extractionRef);
      if(fresh.exists){
        finalData=fresh.data();
        tx.delete(activeLockRef);
        return;
      }
      tx.create(extractionRef,persisted);
      tx.update(resolved.ref,{
        extractionState:'invoice_ai_extracted',
        lastExtractionVersion:ANALYSIS_VERSION,
        lastExtractionAt:FieldValue.serverTimestamp()
      });
      tx.create(auditRef,{
        type:'credit_card_invoice.ai_analyzed',
        actorUid:user.uid,
        evidenceId:resolved.evidenceId,
        cardId,
        analysisVersion:ANALYSIS_VERSION,
        model:result.model,
        itemCount:preview.items.length,
        reviewCount:preview.reviewCount,
        createdAt:FieldValue.serverTimestamp()
      });
      tx.delete(activeLockRef);
    });

    return res.json({
      ok:true,
      evidenceId:resolved.evidenceId,
      card:publicCard(cardId,card),
      preview:finalData.preview,
      model:finalData.model,
      analysisVersion:ANALYSIS_VERSION
    });
  }catch(err:any){
    const refToRelease=lockRef;
    if(refToRelease&&requestId){
      try{
        await adminDb.runTransaction(async tx=>{
          const lock=await tx.get(refToRelease);
          if(lock.exists&&lock.data()?.requestId===requestId) tx.delete(refToRelease);
        });
      }catch{}
    }

    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','AI_NOT_CONFIGURED',
      'INVOICE_IMAGE_TYPE_REQUIRED','INVOICE_IMAGE_TOO_LARGE','CARD_NOT_FOUND','CARD_NOT_ACTIVE',
      'CARD_CYCLE_INVALID','EVIDENCE_NOT_FOUND','EVIDENCE_STORAGE_UNAVAILABLE',
      'EVIDENCE_INVALID_METADATA','EVIDENCE_SIZE_MISMATCH','EVIDENCE_SIGNATURE_MISMATCH','EVIDENCE_HASH_MISMATCH'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'INVOICE_IMAGE_ANALYSIS_FAILED');
  }
}
