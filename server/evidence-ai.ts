import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { detectDocumentSignals } from '../src/core/document-signals.js';
import { parseFinancialList } from '../src/core/text-parser.js';
import { extractFinancialImage } from './ai/financial-image.js';
import { buildImportedMovements, type ImportedMovementList } from '../src/core/movement-import.js';
import { transcribeFinancialAudio } from './ai/audio-transcription.js';
import { isOpenAiConfigured, transcriptionModel, visionModel } from './ai/openai-client.js';
import { runAiGateway } from './ai/gateway.js';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { verifyVaultPreviewBytes } from './vault-verifier.js';
import { assertScopedAccess, requestedScope } from './privacy.js';

const LOCK_TTL_MS=2*60*1000;

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function privateJson(res:Response){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('X-Content-Type-Options','nosniff');
}

async function resolveEvidence(householdId:string,evidenceId:string){
  if(!/^[A-Za-z0-9_-]{6,128}$/.test(evidenceId)) return null;
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
  return {evidenceId,ref,snap,data};
}

function publicExtraction(data:any){
  return {
    ok:true,
    state:data.state,
    kind:data.kind,
    analysisVersion:data.analysisVersion,
    model:data.model,
    extraction:data.extraction||null,
    transcript:data.transcript||null,
    transcriptTruncated:Boolean(data.transcriptTruncated),
    parsedInterpretations:data.parsedInterpretations||null,
    movementList:data.movementList||null
  };
}

export async function analyzeEvidenceWithAi(req:Request,res:Response){
  privateJson(res);
  let lockRef:DocumentReference|null=null;
  let requestId='';
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const requestedId=String(req.body?.evidenceId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');

    if(!isOpenAiConfigured()) return error(res,503,'AI_NOT_CONFIGURED');
    const resolved=await resolveEvidence(householdId,requestedId);
    if(!resolved) return error(res,404,'EVIDENCE_NOT_FOUND');
    assertScopedAccess(resolved.data,user.uid);

    const mimeType=String(resolved.data.mimeType||resolved.data.declaredMimeType||'');
    const kind=mimeType.startsWith('image/')?'image':mimeType.startsWith('audio/')?'audio':null;
    if(!kind) return error(res,400,'AI_MEDIA_TYPE_UNSUPPORTED');

    const analysisVersion=kind==='image'?'vision-v2':'audio-v1';
    const extractionRef=resolved.ref.collection('extractions').doc(analysisVersion);
    const existing=await extractionRef.get();
    if(existing.exists) return res.json(publicExtraction(existing.data()));

    const activeLockRef=resolved.ref.collection('analysisLocks').doc(analysisVersion);
    lockRef=activeLockRef;
    requestId=randomUUID();
    const nowMs=Date.now();
    let acquired=false;
    let racedExtraction:any=null;

    await adminDb.runTransaction(async tx=>{
      const [freshExtraction,lock]=await Promise.all([tx.get(extractionRef),tx.get(activeLockRef)]);
      if(freshExtraction.exists){
        racedExtraction=freshExtraction.data();
        return;
      }
      const lockData=lock.exists?lock.data():null;
      if(lockData&&Number(lockData.expiresAtMs||0)>nowMs){
        return;
      }
      tx.set(activeLockRef,{
        requestId,
        actorUid:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        expiresAtMs:nowMs+LOCK_TTL_MS
      });
      acquired=true;
    });

    if(racedExtraction) return res.json(publicExtraction(racedExtraction));
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

    let persisted:any;
    if(kind==='image'){
      const result=await runAiGateway({
        householdId,
        userUid:user.uid,
        provider:'openai',
        task:'financial_image',
        model:visionModel(),
        promptVersion:'vision-v2',
        fingerprint:String(resolved.data.sha256||resolved.evidenceId)
      },()=>extractFinancialImage(bytes,mimeType));
      const screenType=result.extraction.screen?.screenType;
      const cashMovementScreen=!['card_home','card_statement','retail_account'].includes(String(screenType||''));
      const screenMovements=cashMovementScreen?(result.extraction.screen?.movements||[]):[];
      const movementList:ImportedMovementList|null=screenMovements.length?{
        documentType:result.extraction.screen?.screenType==='transaction_list'?'transaction_list':'bank_screenshot',
        institution:result.extraction.screen?.institution||result.extraction.institution,
        overallConfidence:result.extraction.overallConfidence,
        ambiguities:result.extraction.ambiguities,
        items:screenMovements
      }:null;
      const parsedInterpretations=movementList?buildImportedMovements(movementList):[];

      persisted={
        version:2,
        analysisVersion,
        evidenceId:resolved.evidenceId,
        state:'extracted',
        kind:'image',
        model:result.model,
        extraction:result.extraction,
        movementList,
        parsedInterpretations:parsedInterpretations.length?parsedInterpretations:null,
        deterministic:false,
        aiUsed:true,
        visionUsed:true,
        sttUsed:false,
        ocrUsed:false,
        createdAt:FieldValue.serverTimestamp()
      };
    }else{
      const result=await runAiGateway({
        householdId,
        userUid:user.uid,
        provider:'openai',
        task:'audio_transcription',
        model:transcriptionModel(),
        promptVersion:'audio-v1',
        fingerprint:String(resolved.data.sha256||resolved.evidenceId)
      },()=>transcribeFinancialAudio(bytes,mimeType,String(resolved.data.originalName||'audio')));
      const parsedInterpretations=parseFinancialList(result.transcript).filter(item=>item.money.amountMinor>0);
      persisted={
        version:1,
        analysisVersion,
        evidenceId:resolved.evidenceId,
        state:'extracted',
        kind:'audio',
        model:result.model,
        transcript:result.transcript,
        transcriptTruncated:result.truncated,
        parsedInterpretations:parsedInterpretations.length?parsedInterpretations:null,
        signals:detectDocumentSignals(result.transcript),
        deterministic:false,
        aiUsed:true,
        visionUsed:false,
        sttUsed:true,
        ocrUsed:false,
        createdAt:FieldValue.serverTimestamp()
      };
    }

    const auditRef=adminDb.collection('households').doc(householdId).collection('auditEvents').doc();
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
        extractionState:'ai_extracted',
        lastExtractionVersion:analysisVersion,
        lastExtractionAt:FieldValue.serverTimestamp()
      });
      tx.create(auditRef,{
        type:'evidence.ai_analyzed',
        actorUid:user.uid,
        scope:requestedScope(resolved.data.scope),
        ownerUid:requestedScope(resolved.data.scope)==='personal'?user.uid:null,
        evidenceId:resolved.evidenceId,
        analysisVersion,
        mediaKind:kind,
        model:persisted.model,
        createdAt:FieldValue.serverTimestamp()
      });
      tx.delete(activeLockRef);
    });

    return res.json(publicExtraction(finalData));
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
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','AI_NOT_CONFIGURED',
      'AI_IMAGE_TYPE_REQUIRED','AI_IMAGE_TOO_LARGE','AI_AUDIO_TYPE_REQUIRED','AI_AUDIO_TOO_LARGE',
      'EVIDENCE_STORAGE_UNAVAILABLE','EVIDENCE_INVALID_METADATA','EVIDENCE_SIZE_MISMATCH',
      'EVIDENCE_SIGNATURE_MISMATCH','EVIDENCE_HASH_MISMATCH',
      'AI_GATEWAY_DISABLED','AI_PROVIDER_DISABLED','AI_TASK_DISABLED','AI_PROMPT_DISABLED','AI_CIRCUIT_OPEN','AI_GATEWAY_TIMEOUT',
      'AI_GLOBAL_REQUEST_CAP_REACHED','AI_GLOBAL_BUDGET_REACHED','AI_HOUSEHOLD_BUDGET_REACHED','AI_USER_BUDGET_REACHED'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'AI_ANALYSIS_FAILED');
  }
}
