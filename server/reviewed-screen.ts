import {screenTotalCheck} from '../src/core/screen-total-check.js';
import {createHash} from 'node:crypto';
import type {Request,Response} from 'express';
import {FieldValue} from 'firebase-admin/firestore';
import {z} from 'zod';
import {adminDb} from './firebase-admin.js';
import {requireFirebaseUser,requireHouseholdMember} from './auth.js';
import {assertScopedAccess,requestedScope} from './privacy.js';
import {ScreenSnapshotSchema,normalizeFinancialScreenSnapshot} from './ai/financial-image.js';
import {isDeviceStatusName} from '../src/core/savings-pot-import.js';
import {normalizeSavingsPotName} from '../src/core/savings-pots.js';
import {assertScreenRevision,validObservationDate} from '../src/core/screen-reconciliation.js';

const id=z.string().regex(/^[A-Za-z0-9_-]{6,128}$/);
const decision=z.object({targetId:id.nullable().optional(),expectedUpdatedAtMs:z.number().nullable().optional(),expectedBalanceMinor:z.number().nullable().optional(),createNew:z.boolean().optional(),sourceAccountLabel:z.string().max(80).optional(),goalGroupId:id.nullable().optional(),balanceCoverage:z.enum(['includes_pots','excludes_pots','unknown']).optional(),includedSavingsMinor:z.number().int().nonnegative().nullable().optional()});
const Review=z.object({observedOn:z.string().refine(validObservationDate),accounts:z.array(decision).max(20),pots:z.array(decision).max(30)});
const hash=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,40);
const fail=(code:string,statusCode=409)=>Object.assign(new Error(code),{statusCode});
const allowed=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED','PRIVATE_RECORD_ACCESS_DENIED','EVIDENCE_NOT_FOUND','SCREEN_REVIEW_REQUIRED','SCREEN_REVIEW_CONFLICT','SCREEN_OBSERVATION_OLDER','SCREEN_SOURCE_MISMATCH','SCREEN_INSTITUTION_REQUIRED','SCREEN_UNDO_CONFLICT','SCREEN_IMPORT_NOT_FOUND','PRIVACY_SCOPE_MISMATCH'];

// The entire reviewed import and its receipt are committed together. Retrying a
// request or uploading the same canonical evidence cannot repeat any mutation.
export async function commitReviewedScreen(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    const parsed=ScreenSnapshotSchema.safeParse(req.body?.screenSnapshot);
    const reviewed=Review.safeParse(req.body?.review);
    if(!parsed.success||!reviewed.success) throw fail('SCREEN_REVIEW_REQUIRED');
    const screen=normalizeFinancialScreenSnapshot(parsed.data);
    if(screenTotalCheck(screen).mismatch) throw fail('SCREEN_REVIEW_REQUIRED');
    const review=reviewed.data;
    if(screen.pots.some(p=>isDeviceStatusName(p.name))) throw fail('SCREEN_REVIEW_REQUIRED');
    if(review.accounts.length!==screen.accounts.length||review.pots.length!==screen.pots.length||req.body?.includeMovements===true) throw fail('SCREEN_REVIEW_REQUIRED');
    if((screen.accounts.length||screen.pots.length)&&!screen.institution) throw fail('SCREEN_INSTITUTION_REQUIRED');
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
    if(review.observedOn>today) throw fail('SCREEN_REVIEW_REQUIRED');
    const household=adminDb.collection('households').doc(householdId);
    if(!id.safeParse(req.body?.evidenceId).success) throw fail('EVIDENCE_NOT_FOUND',404);
    let evidenceRef=household.collection('evidenceAssets').doc(req.body.evidenceId);
    let evidence=await evidenceRef.get();
    if(evidence.data()?.canonicalEvidenceId){evidenceRef=household.collection('evidenceAssets').doc(String(evidence.data()!.canonicalEvidenceId));evidence=await evidenceRef.get();}
    if(!evidence.exists||evidence.data()?.status!=='accepted'||evidence.data()?.immutable!==true) throw fail('EVIDENCE_NOT_FOUND',404);
    assertScopedAccess(evidence.data()!,user.uid);
    const scope=requestedScope(evidence.data()!.scope);
    if(req.body?.scope!==undefined&&requestedScope(req.body.scope)!==scope) throw fail('PRIVACY_SCOPE_MISMATCH');
    const ownerUid=scope==='personal'?user.uid:null;
    const receiptRef=household.collection('screenImports').doc(hash([scope,ownerUid||'',evidenceRef.id].join('|')));
    const records:Array<{collection:string;ref:FirebaseFirestore.DocumentReference;data:Record<string,any>;choice?:z.infer<typeof decision>}>=[];
    const sourceFields={scope,ownerUid,currency:'BRL',institutionName:screen.institution,status:'active',source:'screen_import',observedOn:review.observedOn,evidenceIds:FieldValue.arrayUnion(evidenceRef.id),importedBy:user.uid,updatedAt:FieldValue.serverTimestamp(),lastScreenCommitId:receiptRef.id};
    for(const [i,a] of screen.accounts.entries()){
      const choice=review.accounts[i];
      if(!choice.targetId&&!choice.createNew) throw fail('SCREEN_REVIEW_REQUIRED');
      if(choice.balanceCoverage==='includes_pots'&&(!Number.isSafeInteger(choice.includedSavingsMinor)||choice.includedSavingsMinor!>a.balanceMinor)) throw fail('SCREEN_REVIEW_REQUIRED');
      records.push({collection:'accounts',ref:household.collection('accounts').doc(choice.targetId||hash(receiptRef.id+'|account|'+i)),choice,data:{...sourceFields,name:a.name,balanceMinor:a.balanceMinor,amountMinor:a.balanceMinor,currency:a.currency,type:a.productType==='wallet'?'wallet':'bank',connectedProductType:a.productType==='investment'?'investment':null,last4:a.last4,sourceAccountLabel:choice.sourceAccountLabel||null,balanceAsOf:FieldValue.serverTimestamp(),balanceCoverage:choice.balanceCoverage||'unknown',includedSavingsMinor:choice.balanceCoverage==='includes_pots'?choice.includedSavingsMinor:null}});
    }
    for(const [i,p] of screen.pots.entries()){
      const choice=review.pots[i];
      if(!choice.targetId&&!choice.createNew) throw fail('SCREEN_REVIEW_REQUIRED');
      records.push({collection:'savingsPots',ref:household.collection('savingsPots').doc(choice.targetId||hash(receiptRef.id+'|pot|'+i)),choice,data:{...sourceFields,name:p.name,sourceName:p.name,balanceMinor:p.balanceMinor,amountMinor:p.balanceMinor,currency:p.currency,trackingMode:'bank_mirror',sourceAccountLabel:choice.sourceAccountLabel||null,...(choice.goalGroupId!==undefined?{goalGroupId:choice.goalGroupId}:{}),...(p.goalMinor!=null?{goalMinor:p.goalMinor}:{}),...(p.targetDate?{targetDate:p.targetDate}:{})}});
    }
    for(const [i,c] of screen.cards.entries()) records.push({collection:'cardSnapshots',ref:household.collection('cardSnapshots').doc(hash([scope,ownerUid||'','card',screen.institution,c.name,c.last4||''].join('|'))),data:{...sourceFields,...c}});
    // Commitments retain their lifecycle. A later screenshot never reopens a paid bill.
    for(const c of screen.commitments){
      if(c.needsReview||c.confidence<0.86) throw fail('SCREEN_REVIEW_REQUIRED');
      records.push({collection:'commitments',ref:household.collection('commitments').doc(hash([scope,ownerUid||'','screen_commitment',c.description,String(c.amountMinor),c.dueOn||'',String(c.installment?.current||''),String(c.installment?.total||'')].join('|'))),data:{...sourceFields,description:c.description,amountMinor:c.amountMinor,dueOn:c.dueOn,dueDay:c.dueDay??(c.dueOn?Number(c.dueOn.slice(8,10)):null),recurring:c.recurring===true,recurrence:c.recurring?'monthly':null,installment:c.installment,direction:'expense'}});
    }
    if(new Set(records.map(r=>r.ref.path)).size!==records.length) throw fail('SCREEN_REVIEW_REQUIRED');
    let result:any;
    await adminDb.runTransaction(async tx=>{
      const receipt=await tx.get(receiptRef);
      if(receipt.exists){assertScopedAccess(receipt.data()!,user.uid);result={...receipt.data()!.result,replayed:true,undone:!!receipt.data()!.undoneAt};return;}
      const snapshots=await Promise.all(records.map(r=>tx.get(r.ref)));
      const groupIds=[...new Set(records.map(r=>r.choice?.goalGroupId).filter((v):v is string=>!!v))];
      const groupSnaps=await Promise.all(groupIds.map(g=>tx.get(household.collection('savingsPots').doc(g))));
      for(const group of groupSnaps){
        if(!group.exists) throw fail('SCREEN_SOURCE_MISMATCH');
        assertScopedAccess(group.data()!,user.uid);
        if(group.data()!.scope!==scope||group.data()!.status!=='active') throw fail('SCREEN_SOURCE_MISMATCH');
        for(const r of records.filter(r=>r.choice?.goalGroupId===group.id)) if(r.data.currency!==group.data()!.currency) throw fail('SCREEN_SOURCE_MISMATCH');
      }
      const changes:any[]=[];
      const counts={accounts:0,pots:0,cards:0,commitments:0,movements:0,skipped:0,created:0,updated:0,unchanged:0};
      for(const [i,r] of records.entries()){
        const previous=snapshots[i].data();
        if(previous){
          assertScopedAccess(previous,user.uid);
          if((previous.scope||'household')!==scope||previous.currency!==r.data.currency||previous.status==='archived'||(r.choice&&previous.institutionName&&normalizeSavingsPotName(String(previous.institutionName))!==normalizeSavingsPotName(screen.institution||''))) throw fail('SCREEN_SOURCE_MISMATCH');
          if(r.choice&&r.collection==='accounts'&&previous.last4&&r.data.last4&&previous.last4!==r.data.last4) throw fail('SCREEN_SOURCE_MISMATCH');
          if(r.choice) assertScreenRevision({id:r.ref.id,name:String(previous.name),balanceMinor:previous.balanceMinor??null,currency:String(previous.currency),updatedAtMs:previous.updatedAt?.toMillis?.()??null,observedOn:previous.observedOn||previous.balanceAsOf?.toDate?.().toISOString().slice(0,10)||null},r.choice,review.observedOn);
          else if(previous.observedOn&&review.observedOn<previous.observedOn) throw fail('SCREEN_OBSERVATION_OLDER');
        }else if(r.choice?.targetId) throw fail('SCREEN_REVIEW_CONFLICT');
        if(previous&&r.collection==='savingsPots') r.data.name=previous.name||r.data.name;
        const unchanged=previous&&Object.entries(r.data).filter(([key])=>!['updatedAt','balanceAsOf','lastScreenCommitId','evidenceIds','importedBy','observedOn'].includes(key)).every(([key,val])=>JSON.stringify(previous[key]??null)===JSON.stringify(val??null));
        counts[previous?unchanged?'unchanged':'updated':'created']++;
        const key=r.collection==='savingsPots'?'pots':r.collection==='cardSnapshots'?'cards':r.collection as 'accounts'|'commitments';counts[key]++;
        const data={...r.data,...(!previous?{createdAt:FieldValue.serverTimestamp()}:{}),...(r.collection==='commitments'?{status:previous?.status||'pending'}:{})};
        tx.set(r.ref,data,{merge:true});
        changes.push({collection:r.collection,id:r.ref.id,before:previous||null});
        if(r.collection==='savingsPots'&&(!previous||previous.balanceMinor!==r.data.balanceMinor)) tx.create(household.collection('savingsPotActivities').doc(),{savingsPotId:r.ref.id,type:'screen_sync',amountMinor:Math.abs(r.data.balanceMinor-(previous?.balanceMinor||0)),previousBalanceMinor:previous?.balanceMinor??null,resultingBalanceMinor:r.data.balanceMinor,currency:r.data.currency,scope,ownerUid,actorUid:user.uid,source:'screen_import',evidenceId:evidenceRef.id,screenImportId:receiptRef.id,createdAt:FieldValue.serverTimestamp()});
      }
      result={ok:true,importId:receiptRef.id,evidenceId:evidenceRef.id,counts,screenType:screen.screenType,institution:screen.institution,analysisSource:'client_reviewed'};
      tx.create(receiptRef,{scope,ownerUid,actorUid:user.uid,evidenceId:evidenceRef.id,changes,result,createdAt:FieldValue.serverTimestamp()});
      tx.create(household.collection('auditEvents').doc(),{type:'financial_screen.committed',scope,ownerUid,actorUid:user.uid,evidenceId:evidenceRef.id,screenImportId:receiptRef.id,counts,createdAt:FieldValue.serverTimestamp()});
    });
    return res.status(result.replayed?200:201).json(result);
  }catch(err:any){return res.status(err.statusCode||(allowed.includes(err.message)?409:500)).json({ok:false,error:allowed.includes(err.message)?err.message:'FINANCIAL_SCREEN_COMMIT_FAILED'});}
}

export async function undoReviewedScreen(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    if(!id.safeParse(req.body?.importId).success) throw fail('SCREEN_IMPORT_NOT_FOUND',404);
    const household=adminDb.collection('households').doc(householdId);
    const receiptRef=household.collection('screenImports').doc(req.body.importId);
    await adminDb.runTransaction(async tx=>{
      const receipt=await tx.get(receiptRef);
      if(!receipt.exists) throw fail('SCREEN_IMPORT_NOT_FOUND',404);
      const data=receipt.data()!;assertScopedAccess(data,user.uid);
      if(data.undoneAt) return;
      // Only the author can undo the entire import, including newly created records.
      if(data.actorUid!==user.uid) throw fail('SCREEN_UNDO_CONFLICT');
      const changes=data.changes as Array<{collection:string;id:string;before:Record<string,any>|null}>;
      const refs=changes.map(c=>household.collection(c.collection).doc(c.id));
      const current=await Promise.all(refs.map(r=>tx.get(r)));
      for(const s of current){
        if(!s.exists||s.data()?.lastScreenCommitId!==receipt.id||!s.data()?.updatedAt?.isEqual?.(data.createdAt)) throw fail('SCREEN_UNDO_CONFLICT');
        assertScopedAccess(s.data()!,user.uid);
      }
      for(const [i,c] of changes.entries()){
        if(c.before) tx.set(refs[i],{...c.before,updatedAt:FieldValue.serverTimestamp()});
        else tx.update(refs[i],{status:c.collection==='commitments'?'cancelled':'archived',updatedAt:FieldValue.serverTimestamp()});
        if(c.collection==='savingsPots') tx.create(household.collection('savingsPotActivities').doc(),{savingsPotId:c.id,type:'screen_undo',amountMinor:Math.abs((c.before?.balanceMinor||0)-Number(current[i].data()?.balanceMinor||0)),resultingBalanceMinor:c.before?.balanceMinor||0,scope:data.scope,ownerUid:data.ownerUid||null,actorUid:user.uid,evidenceId:data.evidenceId,screenImportId:receipt.id,createdAt:FieldValue.serverTimestamp()});
      }
      tx.update(receiptRef,{undoneAt:FieldValue.serverTimestamp()});
      tx.create(household.collection('auditEvents').doc(),{type:'financial_screen.undone',scope:data.scope,ownerUid:data.ownerUid||null,actorUid:user.uid,screenImportId:receipt.id,createdAt:FieldValue.serverTimestamp()});
    });
    return res.json({ok:true});
  }catch(err:any){return res.status(err.statusCode||(allowed.includes(err.message)?409:500)).json({ok:false,error:allowed.includes(err.message)?err.message:'FINANCIAL_SCREEN_UNDO_FAILED'});}
}
