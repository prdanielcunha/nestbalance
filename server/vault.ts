import type { Request, Response } from 'express';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { verifyVaultPreviewBytes } from './vault-verifier.js';
import { assertScopedAccess, visibleDocs } from './privacy.js';
import { normalizeFinancialScope } from '../src/core/privacy.js';
import { searchVaultDocuments } from '../src/core/vault-search.js';

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
    scope:data.scope==='personal'?'personal':'household'
  };
}

async function resolveAcceptedEvidence(householdId:string,evidenceId:string){
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

export async function listVaultEvidence(req:Request,res:Response){
  privateJson(res);
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);
    const snapshot=await adminDb.collection('households').doc(householdId)
      .collection('evidenceAssets').orderBy('createdAt','desc').limit(60).get();
    const items=visibleDocs(snapshot.docs,user.uid)
      .filter(doc=>doc.data().status==='accepted'&&doc.data().immutable===true)
      .slice(0,30)
      .map(evidenceDto);
    return res.json({ok:true,items});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'VAULT_LIST_FAILED');
  }
}

export async function searchVaultEvidence(req:Request,res:Response){
  privateJson(res);
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const query=String(req.body?.query||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,120);
    const requestedView=req.body?.view==='personal'?'personal':req.body?.view==='all'?'all':'household';
    if(query.length<2) return res.json({ok:true,items:[],query});

    await requireHouseholdMember(householdId,user.uid);
    const snapshot=await adminDb.collection('households').doc(householdId)
      .collection('evidenceAssets').orderBy('createdAt','desc').limit(80).get();

    const candidates=visibleDocs(snapshot.docs,user.uid)
      .filter(doc=>doc.data().status==='accepted'&&doc.data().immutable===true)
      .filter(doc=>requestedView==='all'||normalizeFinancialScope(doc.data().scope)===requestedView)
      .slice(0,40);

    const searchDocs=await Promise.all(candidates.map(async doc=>{
      const data=doc.data();
      const version=typeof data.lastExtractionVersion==='string'?data.lastExtractionVersion:'';
      const extractionSnap=version?await doc.ref.collection('extractions').doc(version).get():null;
      const extractionData=extractionSnap?.exists?extractionSnap.data():null;
      const ai=extractionData?.extraction||null;
      const screen=ai?.screen||null;
      const signals=Array.isArray(extractionData?.signals?.candidates)?extractionData.signals.candidates:[];

      return {
        evidenceId:doc.id,
        originalName:String(data.originalName||'Documento'),
        createdAtMs:asMillis(data.createdAt),
        description:typeof ai?.description==='string'?ai.description:null,
        merchant:typeof ai?.merchant==='string'?ai.merchant:null,
        payer:typeof ai?.payer==='string'?ai.payer:null,
        payee:typeof ai?.payee==='string'?ai.payee:null,
        institution:typeof ai?.institution==='string'?ai.institution:typeof screen?.institution==='string'?screen.institution:null,
        amountMinor:Number.isSafeInteger(ai?.amountMinor)?ai.amountMinor:null,
        dateIso:typeof ai?.dateIso==='string'?ai.dateIso:null,
        transcript:typeof extractionData?.transcript==='string'?extractionData.transcript.slice(0,12000):null,
        rawText:typeof extractionData?.text==='string'?extractionData.text.slice(0,20000):null,
        summary:typeof ai?.evidenceSummary==='string'?ai.evidenceSummary:typeof screen?.summary==='string'?screen.summary:null,
        signals
      };
    }));

    const hits=searchVaultDocuments(query,searchDocs,20);
    const byId=new Map(candidates.map(doc=>[doc.id,doc]));
    const items=hits.flatMap(hit=>{
      const doc=byId.get(hit.evidenceId);
      return doc?[{...evidenceDto(doc),matchReason:hit.reason,matchScore:hit.score}]:[];
    });
    return res.json({ok:true,items,query,view:requestedView});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'VAULT_SEARCH_FAILED');
  }
}

export async function getVaultEvidenceDetail(req:Request,res:Response){
  privateJson(res);
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const requestedId=String(req.body?.evidenceId||'');
    await requireHouseholdMember(householdId,user.uid);
    const resolved=await resolveAcceptedEvidence(householdId,requestedId);
    if(!resolved) return error(res,404,'EVIDENCE_NOT_FOUND');
    assertScopedAccess(resolved.data,user.uid);

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
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
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
    assertScopedAccess(resolved.data,user.uid);

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
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'VAULT_PREVIEW_FAILED');
  }
}
