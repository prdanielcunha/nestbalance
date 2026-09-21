import type { Request, Response } from 'express';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertCanViewFinancialRecord, canViewFinancialRecord, normalizeFinancialVisibility } from './privacy.js';
import { verifyVaultPreviewBytes } from './vault-verifier.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function privateJson(res:Response){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('X-Content-Type-Options','nosniff');
}

function asMillis(value:any){
  if (typeof value?.toMillis==='function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

function evidenceDto(doc:any){
  const data=doc.data();
  return {
    evidenceId:doc.id,
    originalName:String(data.originalName||'Documento'),
    mimeType:String(data.mimeType||data.declaredMimeType||'application/octet-stream'),
    size:Number(data.verifiedSize||data.declaredSize||0),
    createdAtMs:asMillis(data.createdAt),
    extractionState:data.extractionState||'pending',
    lastExtractionVersion:data.lastExtractionVersion||null,
    visibility:normalizeFinancialVisibility(data.scope)
  };
}

async function resolveAcceptedEvidence(householdId:string,evidenceId:string,userUid:string){
  if(!/^[A-Za-z0-9_-]{6,128}$/.test(evidenceId)) return null;
  let ref=adminDb.doc(`households/${householdId}/evidenceAssets/${evidenceId}`);
  let snap=await ref.get();
  if(!snap.exists) return null;
  let data=snap.data()!;
  assertCanViewFinancialRecord(data,userUid);
  if(data.status==='duplicate'&&data.canonicalEvidenceId){
    evidenceId=String(data.canonicalEvidenceId);
    ref=adminDb.doc(`households/${householdId}/evidenceAssets/${evidenceId}`);
    snap=await ref.get();
    if(!snap.exists) return null;
    data=snap.data()!;
    assertCanViewFinancialRecord(data,userUid);
  }
  if(data.status!=='accepted'||data.immutable!==true) return null;
  return {evidenceId,ref,snap,data};
}

export async function listVaultEvidence(req:Request,res:Response){
  privateJson(res);
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);
    const snapshot=await adminDb.collection('households').doc(householdId)
      .collection('evidenceAssets').orderBy('createdAt','desc').limit(60).get();
    const items=snapshot.docs
      .filter(doc=>doc.data().status==='accepted'&&doc.data().immutable===true&&canViewFinancialRecord(doc.data(),user.uid))
      .slice(0,30)
      .map(evidenceDto);
    return res.json({ok:true,items});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','FINANCIAL_PRIVACY_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'VAULT_LIST_FAILED');
  }
}

export async function getVaultEvidenceDetail(req:Request,res:Response){
  privateJson(res);
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const requestedId=String(req.body?.evidenceId||'');
    await requireHouseholdMember(householdId,user.uid);
    const resolved=await resolveAcceptedEvidence(householdId,requestedId,user.uid);
    if(!resolved) return error(res,404,'EVIDENCE_NOT_FOUND');

    const extractionVersion=String(resolved.data.lastExtractionVersion||'native-text-v1');
    const extraction=await resolved.ref.collection('extractions').doc(extractionVersion).get();
    const extractionData=extraction.exists?extraction.data():null;
    return res.json({
      ok:true,
      evidence:evidenceDto(resolved.snap),
      understood:extractionData?{
        state:extractionData.state||'unknown',
        parser:extractionData.parser||null,
        characters:Number(extractionData.characters||0),
        truncated:Boolean(extractionData.truncated),
        aiUsed:Boolean(extractionData.aiUsed),
        ocrUsed:Boolean(extractionData.ocrUsed),
        signals:extractionData.signals||null,
        extraction:extractionData.extraction||null,
        transcriptPreview:typeof extractionData.transcript==='string'?extractionData.transcript.slice(0,1200):null,
        analysisVersion:extractionData.analysisVersion||extractionData.extractionVersion||extractionVersion,
        visionUsed:Boolean(extractionData.visionUsed),
        sttUsed:Boolean(extractionData.sttUsed)
      }:null
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','FINANCIAL_PRIVACY_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'VAULT_DETAIL_FAILED');
  }
}

export async function previewVaultEvidence(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const requestedId=String(req.body?.evidenceId||'');
    await requireHouseholdMember(householdId,user.uid);
    const resolved=await resolveAcceptedEvidence(householdId,requestedId);
    if(!resolved) return error(res,404,'EVIDENCE_NOT_FOUND');

    const expectedSize=Number(resolved.data.verifiedSize||0);
    const expectedMime=String(resolved.data.mimeType||resolved.data.declaredMimeType||'');
    const expectedHash=String(resolved.data.sha256||'');
    const storagePath=String(resolved.data.storagePath||'');
    if(!storagePath) return error(res,409,'EVIDENCE_PREVIEW_UNAVAILABLE');

    const [bytes]=await adminBucket.file(storagePath).download();
    const verification=verifyVaultPreviewBytes({size:expectedSize,mimeType:expectedMime,sha256:expectedHash},bytes);
    if(!verification.ok) return error(res,409,`EVIDENCE_${verification.reason.toUpperCase()}`);

    const safeName=String(resolved.data.originalName||'documento').replace(/[\r\n"]/g,' ').slice(0,160);
    res.setHeader('Content-Type',expectedMime);
    res.setHeader('Content-Length',String(bytes.length));
    res.setHeader('Content-Disposition',`inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    return res.status(200).send(bytes);
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','FINANCIAL_PRIVACY_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'VAULT_PREVIEW_FAILED');
  }
}
