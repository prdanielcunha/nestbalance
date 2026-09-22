
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { buildImportedMovements } from '../src/core/movement-import.js';
import { fingerprintForInterpretation } from '../src/core/fingerprint.js';
import type { AiFinancialScreenSnapshot } from '../src/core/ai-financial.js';
import { normalizeSavingsPotName } from '../src/core/savings-pots.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { assertScopedAccess, requestedScope } from './privacy.js';
import { ScreenSnapshotSchema } from './ai/financial-image.js';

const ANALYSIS_VERSION='vision-v2';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function hash(value:string){
  return createHash('sha256').update(value).digest('hex');
}

function safeName(value:unknown,fallback:string){
  const text=String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,120);
  return text||fallback;
}

function validId(value:string){
  return /^[A-Za-z0-9_-]{6,128}$/.test(value);
}

function dueDay(value:string|null){
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day=Number(value.slice(8,10));
  return Number.isInteger(day)&&day>=1&&day<=31?day:null;
}

async function resolveEvidence(householdId:string,evidenceId:string){
  if(!validId(evidenceId)) return null;
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

export async function commitFinancialScreen(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const requestedEvidenceId=String(req.body?.evidenceId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');

    const resolved=await resolveEvidence(householdId,requestedEvidenceId);
    if(!resolved) return error(res,404,'EVIDENCE_NOT_FOUND');
    assertScopedAccess(resolved.data,user.uid);
    const scope=requestedScope(resolved.data.scope);
    const ownerUid=scope==='personal'?user.uid:null;

    const extractionSnap=await resolved.ref.collection('extractions').doc(ANALYSIS_VERSION).get();
    const extraction=extractionSnap.exists?extractionSnap.data()?.extraction:null;
    const persistedScreen=extraction?.screen as AiFinancialScreenSnapshot|null|undefined;
    const reviewed=ScreenSnapshotSchema.safeParse(req.body?.screenSnapshot);
    const screen=persistedScreen??(reviewed.success?reviewed.data:null);
    if(!screen){
      if(!extractionSnap.exists&&req.body?.screenSnapshot===undefined) return error(res,409,'SCREEN_ANALYSIS_REQUIRED');
      return error(res,409,'SCREEN_SNAPSHOT_UNAVAILABLE');
    }
    const analysisSource=persistedScreen
      ? 'server_vision'
      : ['gemini_text','local_ocr','client_reviewed'].includes(String(req.body?.analysisSource||''))
        ? String(req.body.analysisSource)
        : 'client_reviewed';

    const household=adminDb.collection('households').doc(householdId);
    const existingPotDocs=screen.pots.length
      ? (await household.collection('savingsPots').where('status','==','active').limit(200).get()).docs
      : [];
    const potIdentity=(institution:unknown,name:unknown)=>[
      scope,
      ownerUid||'',
      normalizeSavingsPotName(String(institution||'')),
      normalizeSavingsPotName(String(name||''))
    ].join('|');
    const existingPotsByIdentity=new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
    for(const doc of existingPotDocs){
      const data=doc.data();
      const existingScope=data.scope==='personal'?'personal':'household';
      const existingOwner=existingScope==='personal'?String(data.ownerUid||''):'';
      if(existingScope!==scope||(scope==='personal'&&existingOwner!==user.uid)) continue;
      const identity=[
        existingScope,
        existingOwner,
        normalizeSavingsPotName(String(data.institutionName||'')),
        normalizeSavingsPotName(String(data.name||''))
      ].join('|');
      if(!existingPotsByIdentity.has(identity)) existingPotsByIdentity.set(identity,doc);
    }

    const batch=adminDb.batch();
    let accounts=0;
    let pots=0;
    let cards=0;
    let commitments=0;
    let movements=0;
    let skipped=0;

    for(const item of screen.accounts.slice(0,20)){
      if(item.confidence<0.86||!Number.isSafeInteger(item.balanceMinor)||item.balanceMinor<0){
        skipped++;
        continue;
      }
      const key=hash([scope,ownerUid||'','screen_account',screen.institution||'',item.productType,item.name,item.last4||''].join('|'));
      const ref=household.collection('accounts').doc(key.slice(0,40));
      batch.set(ref,{
        name:safeName(item.name,screen.institution||'Conta'),
        type:item.productType==='wallet'?'wallet':'bank',
        connectedProductType:item.productType==='investment'?'investment':null,
        balanceMinor:item.balanceMinor,
        amountMinor:item.balanceMinor,
        currency:item.currency,
        scope,
        ownerUid,
        status:'active',
        source:'screen_import',
        institutionName:screen.institution||null,
        last4:item.last4,
        balanceAsOf:FieldValue.serverTimestamp(),
        evidenceIds:FieldValue.arrayUnion(resolved.evidenceId),
        updatedAt:FieldValue.serverTimestamp(),
        importedBy:user.uid,
        schemaVersion:2
      },{merge:true});
      accounts++;
    }

    const seenPotIdentities=new Set<string>();
    for(const item of screen.pots.slice(0,30)){
      if(item.confidence<0.86||!Number.isSafeInteger(item.balanceMinor)||item.balanceMinor<0){
        skipped++;
        continue;
      }
      const identity=potIdentity(screen.institution,item.name);
      if(seenPotIdentities.has(identity)){
        skipped++;
        continue;
      }
      seenPotIdentities.add(identity);
      const existing=existingPotsByIdentity.get(identity);
      const key=hash([scope,ownerUid||'','screen_pot',normalizeSavingsPotName(screen.institution||''),normalizeSavingsPotName(item.name)].join('|'));
      const ref=existing?.ref??household.collection('savingsPots').doc(key.slice(0,40));
      batch.set(ref,{
        name:safeName(item.name,'Dinheiro guardado'),
        balanceMinor:item.balanceMinor,
        goalMinor:Number.isSafeInteger(item.goalMinor)?item.goalMinor:null,
        currency:item.currency,
        institutionName:screen.institution||null,
        normalizedName:normalizeSavingsPotName(item.name),
        normalizedInstitution:normalizeSavingsPotName(screen.institution||''),
        source:'screen_import',
        scope,
        ownerUid,
        status:'active',
        evidenceIds:FieldValue.arrayUnion(resolved.evidenceId),
        updatedAt:FieldValue.serverTimestamp(),
        importedBy:user.uid,
        analysisSource,
        schemaVersion:2
      },{merge:true});
      pots++;
    }

    for(const item of screen.cards.slice(0,10)){
      if(item.confidence<0.82){
        skipped++;
        continue;
      }
      const key=hash([scope,ownerUid||'','screen_card',screen.institution||'',item.name,item.last4||''].join('|'));
      const ref=household.collection('cardSnapshots').doc(key.slice(0,40));
      batch.set(ref,{
        name:safeName(item.name,'Cartão'),
        last4:item.last4,
        statementAmountMinor:Number.isSafeInteger(item.statementAmountMinor)?item.statementAmountMinor:null,
        dueOn:item.dueOn,
        availableLimitMinor:Number.isSafeInteger(item.availableLimitMinor)?item.availableLimitMinor:null,
        totalLimitMinor:Number.isSafeInteger(item.totalLimitMinor)?item.totalLimitMinor:null,
        institutionName:screen.institution||null,
        source:'screen_import',
        scope,
        ownerUid,
        evidenceIds:FieldValue.arrayUnion(resolved.evidenceId),
        updatedAt:FieldValue.serverTimestamp(),
        importedBy:user.uid,
        schemaVersion:1
      },{merge:true});
      cards++;
    }

    for(const item of screen.commitments.slice(0,50)){
      if(item.needsReview||item.confidence<0.86||!Number.isSafeInteger(item.amountMinor)||item.amountMinor<=0){
        skipped++;
        continue;
      }
      const key=hash([scope,ownerUid||'','screen_commitment',item.description,String(item.amountMinor),item.dueOn||'',String(item.installment?.current||''),String(item.installment?.total||'')].join('|'));
      const ref=household.collection('commitments').doc(key.slice(0,40));
      batch.set(ref,{
        description:safeName(item.description,'Conta para pagar'),
        amountMinor:item.amountMinor,
        currency:'BRL',
        direction:'expense',
        source:'screen_import',
        scope,
        ownerUid,
        evidenceIds:FieldValue.arrayUnion(resolved.evidenceId),
        status:'pending',
        dueDay:dueDay(item.dueOn),
        dueOn:item.dueOn,
        recurring:false,
        recurrence:null,
        installment:item.installment,
        updatedAt:FieldValue.serverTimestamp(),
        importedBy:user.uid,
        schemaVersion:2
      },{merge:true});
      commitments++;
    }

    if(req.body?.includeMovements===true){
      const movementList={
        documentType:'transaction_list' as const,
        institution:screen.institution,
        overallConfidence:1,
        ambiguities:[],
        items:screen.movements
      };
      const parsed=buildImportedMovements(movementList);
      for(let index=0;index<parsed.length;index++){
        const item=parsed[index];
        if(item.needsReview.includes('direction')||item.needsReview.includes('amount')||item.needsReview.includes('amount_positive')){
          skipped++;
          continue;
        }
        const observedOn=item.occurredOn||new Date().toISOString().slice(0,10);
        const fingerprint=fingerprintForInterpretation(item,observedOn);
        const id=hash([scope,ownerUid||'','screen_movement',resolved.evidenceId,String(index),fingerprint].join('|')).slice(0,40);
        const ref=household.collection('transactions').doc(id);
        batch.set(ref,{
          description:item.description,
          amountMinor:item.money.amountMinor,
          currency:item.money.currency,
          direction:item.direction,
          source:'screen_import',
          scope,
          ownerUid,
          sourceText:item.sourceText,
          confidence:item.confidence,
          needsReview:item.needsReview,
          interpretation:{parserVersion:item.parserVersion,fieldConfidence:item.fieldConfidence},
          evidenceIds:[resolved.evidenceId],
          createdBy:user.uid,
          createdAt:FieldValue.serverTimestamp(),
          observedOn,
          status:'confirmed',
          recurring:false,
          recurrence:null,
          dueDay:null,
          installment:item.installment??null,
          fingerprint,
          schemaVersion:2
        },{merge:true});
        movements++;
      }
    }
    batch.create(household.collection('auditEvents').doc(),{
      type:'financial_screen.committed',
      scope,
      actorUid:user.uid,
      evidenceId:resolved.evidenceId,
      screenType:screen.screenType,
      institution:screen.institution,
      analysisSource,
      counts:{accounts,pots,cards,commitments,movements,skipped},
      createdAt:FieldValue.serverTimestamp()
    });

    await batch.commit();
    return res.status(201).json({
      ok:true,
      evidenceId:resolved.evidenceId,
      screenType:screen.screenType,
      institution:screen.institution,
      analysisSource,
      counts:{accounts,pots,cards,commitments,movements,skipped}
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','EVIDENCE_NOT_FOUND','SCREEN_ANALYSIS_REQUIRED','SCREEN_SNAPSHOT_UNAVAILABLE'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'FINANCIAL_SCREEN_COMMIT_FAILED');
  }
}
