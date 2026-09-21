import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  buildCreditCardStatementPreview,
  parseCreditCardStatement,
  type CreditCardStatementItem
} from '../src/core/card-statements.js';
import { extractNativeDocumentText } from './document-text.js';
import { extractCreditCardStatementImage } from './ai/card-statement-image.js';
import { isOpenAiConfigured } from './ai/openai-client.js';
import { adminBucket, adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { verifyVaultPreviewBytes } from './vault-verifier.js';

const PREVIEW_TTL_MS=30*60*1000;

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function privateJson(res:Response){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('X-Content-Type-Options','nosniff');
}

function validDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d]=value.split('-').map(Number);
  const x=new Date(y,m-1,d);
  return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d;
}

function inferVisibleDate(dateRaw:string|null,dateIso:string|null,statementDueOn:string){
  if(dateIso&&validDate(dateIso)) return {observedOn:dateIso,yearInferred:false};
  if(!dateRaw) return {observedOn:null,yearInferred:false};

  const full=dateRaw.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if(full){
    let year=Number(full[3]);
    if(year<100) year+=2000;
    const value=[year,String(Number(full[2])).padStart(2,'0'),String(Number(full[1])).padStart(2,'0')].join('-');
    return {observedOn:validDate(value)?value:null,yearInferred:false};
  }

  const short=dateRaw.match(/(\d{1,2})[\/.\-](\d{1,2})/);
  if(short){
    const [dueYear,dueMonth]=statementDueOn.split('-').map(Number);
    const month=Number(short[2]);
    const year=month>dueMonth?dueYear-1:dueYear;
    const value=[year,String(month).padStart(2,'0'),String(Number(short[1])).padStart(2,'0')].join('-');
    return {observedOn:validDate(value)?value:null,yearInferred:true};
  }

  return {observedOn:null,yearInferred:false};
}

function itemKey(item:{
  description:string;
  amountMinor:number;
  observedOn:string|null;
  installment:{current:number;total:number}|null;
},index:number){
  const raw=[
    index,
    item.observedOn||'',
    item.description.toLocaleLowerCase('pt-BR'),
    item.amountMinor,
    item.installment?String(item.installment.current)+'/'+String(item.installment.total):''
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0,20);
}

async function resolveEvidence(householdId:string,evidenceId:string){
  if(!/^[A-Za-z0-9_-]{6,128}$/.test(evidenceId)) return null;
  let ref=adminDb.doc('households/'+householdId+'/evidenceAssets/'+evidenceId);
  let snap=await ref.get();
  if(!snap.exists) return null;
  let data=snap.data()!;
  if(data.status==='duplicate'&&data.canonicalEvidenceId){
    evidenceId=String(data.canonicalEvidenceId);
    ref=adminDb.doc('households/'+householdId+'/evidenceAssets/'+evidenceId);
    snap=await ref.get();
    if(!snap.exists) return null;
    data=snap.data()!;
  }
  if(data.status!=='accepted'||data.immutable!==true) return null;
  return {evidenceId,ref,data};
}

async function getCard(householdId:string,cardId:string){
  if(!/^[A-Za-z0-9_-]{6,128}$/.test(cardId)) return null;
  const ref=adminDb.doc('households/'+householdId+'/creditCards/'+cardId);
  const snap=await ref.get();
  if(!snap.exists||snap.data()?.status!=='active') return null;
  return {ref,data:snap.data()!};
}

async function buildPreview(
  householdId:string,
  cardId:string,
  evidenceId:string,
  statementDueOn:string
){
  if(!validDate(statementDueOn)) throw Object.assign(new Error('INVALID_STATEMENT_DUE_ON'),{statusCode:400});

  const card=await getCard(householdId,cardId);
  if(!card) throw Object.assign(new Error('CARD_NOT_FOUND'),{statusCode:404});

  const evidence=await resolveEvidence(householdId,evidenceId);
  if(!evidence) throw Object.assign(new Error('EVIDENCE_NOT_FOUND'),{statusCode:404});

  const mimeType=String(evidence.data.mimeType||evidence.data.declaredMimeType||'');
  const storagePath=String(evidence.data.storagePath||'');
  if(!storagePath) throw Object.assign(new Error('EVIDENCE_STORAGE_UNAVAILABLE'),{statusCode:409});

  const [bytes]=await adminBucket.file(storagePath).download();
  const verification=verifyVaultPreviewBytes({
    size:Number(evidence.data.verifiedSize||0),
    mimeType,
    sha256:String(evidence.data.sha256||'')
  },bytes);
  if(!verification.ok) throw Object.assign(new Error('EVIDENCE_'+verification.reason.toUpperCase()),{statusCode:409});

  let items:CreditCardStatementItem[]=[];
  let ignoredLineCount=0;
  let sourceKind:'native'|'ai'='native';
  let model:string|null=null;
  let truncated=false;

  if(mimeType.startsWith('image/')){
    if(!isOpenAiConfigured()) throw Object.assign(new Error('AI_NOT_CONFIGURED'),{statusCode:503});
    const result=await extractCreditCardStatementImage(bytes,mimeType);
    sourceKind='ai';
    model=result.model;
    truncated=result.truncated;

    items=result.items.map((item,index)=>{
      const date=inferVisibleDate(item.dateRaw,item.dateIso,statementDueOn);
      const needsReview:string[]=[];
      if(!date.observedOn) needsReview.push('purchase_date');
      else if(date.yearInferred) needsReview.push('purchase_year_inferred');
      if(item.needsConfirmation) needsReview.push('ai_confirmation');

      const normalized={
        description:item.description,
        amountMinor:item.amountMinor,
        observedOn:date.observedOn,
        installment:item.installment,
        lineNumber:index+1,
        confidence:needsReview.length?'medium' as const:'high' as const,
        needsReview,
        sourceLine:'Imagem · '+item.description
      };
      return {...normalized,key:itemKey(normalized,index+1)};
    });
  }else{
    const native=await extractNativeDocumentText(bytes,mimeType);
    if(native.state!=='extracted') throw Object.assign(new Error('STATEMENT_TEXT_UNAVAILABLE'),{statusCode:422});
    truncated=native.truncated;
    const parsed=parseCreditCardStatement(native.text,statementDueOn);
    items=parsed.items;
    ignoredLineCount=parsed.ignoredLineCount;
  }

  if(!items.length) throw Object.assign(new Error('STATEMENT_ITEMS_NOT_FOUND'),{statusCode:422});

  const preview=buildCreditCardStatementPreview(items,statementDueOn,ignoredLineCount);
  const dueDay=Number(card.data.dueDay||0);
  const actualDueDay=Number(statementDueOn.slice(8,10));
  const warnings:string[]=[];
  if(dueDay&&actualDueDay!==dueDay) warnings.push('statement_due_day_differs_from_card');
  if(truncated) warnings.push('source_truncated');
  if(items.some(item=>item.needsReview.length>0)) warnings.push('items_need_review');

  return {
    card,
    evidence,
    preview,
    sourceKind,
    model,
    truncated,
    warnings
  };
}

export async function previewCreditCardStatement(req:Request,res:Response){
  privateJson(res);
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const cardId=String(req.body?.cardId||'');
    const evidenceId=String(req.body?.evidenceId||'');
    const statementDueOn=String(req.body?.statementDueOn||'');
    await requireHouseholdMember(householdId,user.uid);

    const built=await buildPreview(householdId,cardId,evidenceId,statementDueOn);
    const previewId=randomUUID();
    const previewRef=adminDb.doc('households/'+householdId+'/statementPreviews/'+previewId);

    await previewRef.create({
      version:1,
      cardId,
      evidenceId:built.evidence.evidenceId,
      statementDueOn,
      items:built.preview.items,
      currentInvoiceMinor:built.preview.currentInvoiceMinor,
      projectedMonths:built.preview.projectedMonths,
      ignoredLineCount:built.preview.ignoredLineCount,
      sourceKind:built.sourceKind,
      model:built.model,
      warnings:built.warnings,
      createdBy:user.uid,
      createdAt:FieldValue.serverTimestamp(),
      expiresAtMs:Date.now()+PREVIEW_TTL_MS
    });

    return res.json({
      ok:true,
      previewId,
      card:{
        id:cardId,
        name:String(built.card.data.name||'Cartão'),
        dueDay:Number(built.card.data.dueDay||0),
        closingDay:Number(built.card.data.closingDay||0)
      },
      ...built.preview,
      sourceKind:built.sourceKind,
      model:built.model,
      truncated:built.truncated,
      warnings:built.warnings
    });
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','INVALID_STATEMENT_DUE_ON',
      'CARD_NOT_FOUND','EVIDENCE_NOT_FOUND','EVIDENCE_STORAGE_UNAVAILABLE','EVIDENCE_INVALID_METADATA',
      'EVIDENCE_SIZE_MISMATCH','EVIDENCE_SIGNATURE_MISMATCH','EVIDENCE_HASH_MISMATCH',
      'AI_NOT_CONFIGURED','AI_IMAGE_TYPE_REQUIRED','AI_IMAGE_TOO_LARGE',
      'STATEMENT_TEXT_UNAVAILABLE','STATEMENT_ITEMS_NOT_FOUND'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'STATEMENT_PREVIEW_FAILED');
  }
}

export async function commitCreditCardStatement(req:Request,res:Response){
  privateJson(res);
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const previewId=String(req.body?.previewId||'');
    await requireHouseholdMember(householdId,user.uid);
    if(!/^[0-9a-f-]{36}$/i.test(previewId)) return error(res,400,'INVALID_STATEMENT_PREVIEW');

    const household=adminDb.collection('households').doc(householdId);
    const previewRef=household.collection('statementPreviews').doc(previewId);
    const previewSnap=await previewRef.get();
    if(!previewSnap.exists) return error(res,404,'STATEMENT_PREVIEW_NOT_FOUND');
    const preview=previewSnap.data()!;
    if(preview.createdBy!==user.uid||Number(preview.expiresAtMs||0)<Date.now()) return error(res,409,'STATEMENT_PREVIEW_EXPIRED');

    const items=Array.isArray(preview.items)?preview.items as CreditCardStatementItem[]:[];
    const requested=Array.isArray(req.body?.itemKeys)?req.body.itemKeys.map(String):items.map(item=>item.key);
    const uniqueKeys=[...new Set(requested)];
    if(!uniqueKeys.length||uniqueKeys.length>120) return error(res,400,'INVALID_STATEMENT_SELECTION');

    const selected=items.filter(item=>uniqueKeys.includes(item.key));
    if(selected.length!==uniqueKeys.length) return error(res,400,'INVALID_STATEMENT_SELECTION');

    const card=await getCard(householdId,String(preview.cardId||''));
    if(!card) return error(res,404,'CARD_NOT_FOUND');

    const batchRef=household.collection('cardStatementImports').doc();
    const auditRef=household.collection('auditEvents').doc();
    const evidenceRef=household.collection('evidenceAssets').doc(String(preview.evidenceId||''));

    const entries=selected.map(item=>{
      const fingerprint=[
        preview.cardId,
        preview.statementDueOn,
        item.observedOn||'',
        item.description.normalize('NFKC').toLocaleLowerCase('pt-BR'),
        item.amountMinor,
        item.installment?String(item.installment.current)+'/'+String(item.installment.total):''
      ].join('|');
      const hash=createHash('sha256').update(fingerprint).digest('hex');
      return {
        item,
        fingerprint,
        keyRef:household.collection('creditCardPurchaseKeys').doc(hash),
        purchaseRef:household.collection('creditCardPurchases').doc()
      };
    });

    let created=0;
    let duplicates=0;

    await adminDb.runTransaction(async tx=>{
      const keySnaps=await Promise.all(entries.map(entry=>tx.get(entry.keyRef)));

      tx.create(batchRef,{
        version:1,
        cardId:preview.cardId,
        evidenceId:preview.evidenceId,
        statementDueOn:preview.statementDueOn,
        sourceKind:preview.sourceKind||'native',
        model:preview.model||null,
        selectedCount:selected.length,
        currentInvoiceMinor:selected.reduce<number>((sum,item)=>sum+Number(item.amountMinor||0),0),
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        status:'confirmed'
      });

      entries.forEach((entry,index)=>{
        if(keySnaps[index].exists){
          duplicates++;
          return;
        }
        created++;
        tx.create(entry.purchaseRef,{
          version:1,
          cardId:preview.cardId,
          statementImportId:batchRef.id,
          evidenceId:preview.evidenceId,
          description:entry.item.description,
          amountMinor:entry.item.amountMinor,
          currency:'BRL',
          observedOn:entry.item.observedOn,
          invoiceDueOn:preview.statementDueOn,
          installment:entry.item.installment||null,
          source:'card_statement_import',
          confidence:entry.item.confidence,
          needsReview:entry.item.needsReview||[],
          fingerprint:entry.fingerprint,
          status:'confirmed',
          createdBy:user.uid,
          createdAt:FieldValue.serverTimestamp()
        });
        tx.create(entry.keyRef,{
          purchaseId:entry.purchaseRef.id,
          cardId:preview.cardId,
          statementImportId:batchRef.id,
          createdAt:FieldValue.serverTimestamp()
        });
      });

      tx.create(auditRef,{
        type:'credit_card.statement_imported',
        actorUid:user.uid,
        entityType:'card_statement_import',
        entityId:batchRef.id,
        cardId:preview.cardId,
        evidenceId:preview.evidenceId,
        created,
        duplicates,
        createdAt:FieldValue.serverTimestamp()
      });

      tx.set(evidenceRef,{
        relatedStatementImportIds:FieldValue.arrayUnion(batchRef.id),
        updatedAt:FieldValue.serverTimestamp()
      },{merge:true});
      tx.delete(previewRef);
    });

    return res.status(201).json({
      ok:true,
      batchId:batchRef.id,
      created,
      duplicates
    });
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','CARD_NOT_FOUND'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'STATEMENT_COMMIT_FAILED');
  }
}
