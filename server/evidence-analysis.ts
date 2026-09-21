import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { detectDocumentSignals } from '../src/core/document-signals.js';
import { extractNativeDocumentText, DOCUMENT_NATIVE_TEXT_MAX_BYTES } from './document-text.js';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertScopedAccess, requestedScope } from './privacy.js';

const EXTRACTION_VERSION='native-text-v1';

function error(res:Response,status:number,code:string) {
  return res.status(status).json({ok:false,error:code});
}

function publicResult(data:any) {
  return {
    ok:true,
    state:data.state,
    parser:data.parser||null,
    reason:data.reason||null,
    text:data.state==='extracted'?data.text:null,
    characters:data.characters||0,
    truncated:Boolean(data.truncated),
    totalPages:data.totalPages||null,
    extractedPages:data.extractedPages||null,
    signals:data.signals||{deterministic:true,inputCharacters:0,scannedCharacters:0,limited:false,candidateLimitReached:false,candidates:[]}
  };
}

export async function analyzeEvidenceText(req:Request,res:Response) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    let evidenceId=String(req.body?.evidenceId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(evidenceId)) return error(res,400,'INVALID_EVIDENCE');

    let evidenceRef=adminDb.doc(`households/${householdId}/evidenceAssets/${evidenceId}`);
    let evidenceSnap=await evidenceRef.get();
    if (!evidenceSnap.exists) return error(res,404,'EVIDENCE_NOT_FOUND');
    let evidence=evidenceSnap.data()!;

    if (evidence.status==='duplicate' && evidence.canonicalEvidenceId) {
      evidenceId=String(evidence.canonicalEvidenceId);
      evidenceRef=adminDb.doc(`households/${householdId}/evidenceAssets/${evidenceId}`);
      evidenceSnap=await evidenceRef.get();
      if (!evidenceSnap.exists) return error(res,404,'CANONICAL_EVIDENCE_NOT_FOUND');
      evidence=evidenceSnap.data()!;
    }
    assertScopedAccess(evidence,user.uid);
    if (evidence.status!=='accepted'||evidence.immutable!==true) return error(res,409,'EVIDENCE_NOT_READY');

    const extractionRef=evidenceRef.collection('extractions').doc(EXTRACTION_VERSION);
    const existing=await extractionRef.get();
    if (existing.exists) return res.json(publicResult(existing.data()));

    const mimeType=String(evidence.mimeType||evidence.declaredMimeType||'');
    const size=Number(evidence.verifiedSize||evidence.declaredSize||0);
    let result:any;

    if (mimeType.startsWith('image/')) {
      result={state:'needs_ai',reason:'visual_input',parser:'routing-v1'};
    } else if (mimeType.startsWith('audio/')) {
      result={state:'needs_ai',reason:'audio_input',parser:'routing-v1'};
    } else if (!Number.isFinite(size)||size<=0||size>DOCUMENT_NATIVE_TEXT_MAX_BYTES) {
      result={state:'unavailable',reason:'input_too_large',parser:'routing-v1'};
    } else {
      const storagePath=String(evidence.storagePath||'');
      if (!storagePath) return error(res,409,'EVIDENCE_STORAGE_UNAVAILABLE');
      const [bytes]=await adminBucket.file(storagePath).download();
      result=await extractNativeDocumentText(bytes,mimeType);
    }

    const signals=result.state==='extracted'
      ? detectDocumentSignals(result.text)
      : {deterministic:true,inputCharacters:0,scannedCharacters:0,limited:false,candidateLimitReached:false,candidates:[]};

    const persisted={
      version:1,
      extractionVersion:EXTRACTION_VERSION,
      evidenceId,
      state:result.state,
      parser:result.parser||'routing-v1',
      reason:result.reason||null,
      text:result.state==='extracted'?result.text:null,
      characters:result.characters||0,
      truncated:Boolean(result.truncated),
      totalPages:result.totalPages||null,
      extractedPages:result.extractedPages||null,
      signals,
      deterministic:true,
      aiUsed:false,
      ocrUsed:false,
      createdAt:FieldValue.serverTimestamp()
    };

    const auditRef=adminDb.collection('households').doc(householdId).collection('auditEvents').doc();
    let finalData:any=persisted;
    await adminDb.runTransaction(async tx=>{
      const raced=await tx.get(extractionRef);
      if (raced.exists) {
        finalData=raced.data();
        return;
      }
      tx.create(extractionRef,persisted);
      tx.update(evidenceRef,{
        extractionState:result.state,
        lastExtractionVersion:EXTRACTION_VERSION,
        lastExtractionAt:FieldValue.serverTimestamp()
      });
      tx.create(auditRef,{
        type:'evidence.native_text_analyzed',
        actorUid:user.uid,
        scope:requestedScope(evidence.scope),
        ownerUid:requestedScope(evidence.scope)==='personal'?user.uid:null,
        evidenceId,
        extractionVersion:EXTRACTION_VERSION,
        state:result.state,
        aiUsed:false,
        ocrUsed:false,
        createdAt:FieldValue.serverTimestamp()
      });
    });

    return res.json(publicResult(finalData));
  } catch (err:any) {
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'EVIDENCE_ANALYSIS_FAILED');
  }
}
