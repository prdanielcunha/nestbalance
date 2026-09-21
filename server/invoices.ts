import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  installmentPlanKey,
  invoiceItemDedupKey,
  parseInvoiceText,
  type InvoicePreview,
  type InvoicePreviewItem
} from '../src/core/invoices.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

const EXTRACTION_VERSION='native-text-v1';
const INVOICE_VISION_VERSION='invoice-vision-v1';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function fail(code:string,statusCode:number){
  throw Object.assign(new Error(code),{statusCode});
}

function validId(value:string){
  return /^[A-Za-z0-9_-]{6,128}$/.test(value);
}

function hash(value:string){
  return createHash('sha256').update(value).digest('hex');
}

type InvoiceContext={
  household:FirebaseFirestore.DocumentReference;
  cardId:string;
  card:any;
  evidenceId:string;
  referenceDate:string;
  preview:InvoicePreview;
};

async function loadInvoiceContext(input:{
  householdId:string;
  cardId:string;
  evidenceId:string;
  referenceDate:string;
  userUid:string;
}):Promise<InvoiceContext>{
  const {householdId,cardId,userUid}=input;
  let evidenceId=input.evidenceId;

  await requireHouseholdMember(householdId,userUid);
  if(!validId(cardId)) fail('INVALID_CARD',400);
  if(!validId(evidenceId)) fail('INVALID_EVIDENCE',400);

  const household=adminDb.collection('households').doc(householdId);
  const [cardSnap,evidenceSnap]=await Promise.all([
    household.collection('creditCards').doc(cardId).get(),
    household.collection('evidenceAssets').doc(evidenceId).get()
  ]);

  if(!cardSnap.exists) fail('CARD_NOT_FOUND',404);
  const card=cardSnap.data()!;
  if(card.status!=='active') fail('CARD_NOT_ACTIVE',409);

  if(!evidenceSnap.exists) fail('EVIDENCE_NOT_FOUND',404);
  let evidence=evidenceSnap.data()!;
  if(evidence.status==='duplicate'&&evidence.canonicalEvidenceId){
    evidenceId=String(evidence.canonicalEvidenceId);
    const canonical=await household.collection('evidenceAssets').doc(evidenceId).get();
    if(!canonical.exists) fail('CANONICAL_EVIDENCE_NOT_FOUND',404);
    evidence=canonical.data()!;
  }
  if(evidence.status!=='accepted'||evidence.immutable!==true) fail('EVIDENCE_NOT_READY',409);

  const evidenceRef=household.collection('evidenceAssets').doc(evidenceId);
  const [nativeExtraction,visionExtraction]=await Promise.all([
    evidenceRef.collection('extractions').doc(EXTRACTION_VERSION).get(),
    evidenceRef.collection('extractions').doc(INVOICE_VISION_VERSION).get()
  ]);

  const closingDay=Number(card.closingDay);
  const dueDay=Number(card.dueDay);
  if(!Number.isInteger(closingDay)||!Number.isInteger(dueDay)) fail('CARD_CYCLE_INVALID',409);

  let preview:InvoicePreview|null=null;
  if(nativeExtraction.exists){
    const extracted=nativeExtraction.data()!;
    if(extracted.state==='extracted'&&typeof extracted.text==='string'&&extracted.text.trim()){
      preview=parseInvoiceText({
        text:extracted.text,
        closingDay,
        dueDay,
        referenceDate:input.referenceDate
      });
    }
  }

  if(!preview&&visionExtraction.exists){
    const visual=visionExtraction.data()!;
    if(
      visual.state==='extracted'&&
      visual.preview&&
      visual.preview.parserVersion==='invoice-vision-v1'&&
      Array.isArray(visual.preview.items)
    ){
      preview=visual.preview as InvoicePreview;
    }
  }

  if(!preview) fail('EVIDENCE_ANALYSIS_REQUIRED',409);

  return {household,cardId,card,evidenceId,referenceDate:input.referenceDate,preview};
}

function publicCard(cardId:string,card:any){
  return {
    id:cardId,
    name:String(card.name||'Cartão'),
    brand:String(card.brand||'other'),
    closingDay:Number(card.closingDay),
    dueDay:Number(card.dueDay),
    last4:typeof card.last4==='string'?card.last4:null
  };
}

function referenceDateFrom(req:Request){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.referenceDate||''))
    ? String(req.body.referenceDate)
    : new Date().toISOString().slice(0,10);
}

export async function previewCreditCardInvoice(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const cardId=String(req.body?.cardId||'');
    const evidenceId=String(req.body?.evidenceId||'');
    const referenceDate=referenceDateFrom(req);

    const context=await loadInvoiceContext({householdId,cardId,evidenceId,referenceDate,userUid:user.uid});

    return res.json({
      ok:true,
      evidenceId:context.evidenceId,
      card:publicCard(context.cardId,context.card),
      preview:context.preview
    });
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
      'INVALID_CARD','INVALID_EVIDENCE','CARD_NOT_FOUND','CARD_NOT_ACTIVE',
      'EVIDENCE_NOT_FOUND','CANONICAL_EVIDENCE_NOT_FOUND','EVIDENCE_NOT_READY',
      'EVIDENCE_ANALYSIS_REQUIRED','INVOICE_TEXT_UNAVAILABLE','CARD_CYCLE_INVALID',
      'EMPTY_INVOICE_TEXT','INVALID_REFERENCE_DATE','INVALID_CLOSING_DAY','INVALID_DUE_DAY'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'INVOICE_PREVIEW_FAILED');
  }
}

export async function commitCreditCardInvoice(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const cardId=String(req.body?.cardId||'');
    const evidenceId=String(req.body?.evidenceId||'');
    const referenceDate=referenceDateFrom(req);
    const rawIds=Array.isArray(req.body?.itemIds)?req.body.itemIds:[];
    const itemIds:string[]=[...new Set<string>(rawIds.map((value:any)=>String(value||'')).filter((value:string)=>Boolean(value)))];
    if(itemIds.length===0) return error(res,400,'EMPTY_INVOICE_SELECTION');
    if(itemIds.length>120) return error(res,400,'INVOICE_SELECTION_TOO_LARGE');

    const context=await loadInvoiceContext({householdId,cardId,evidenceId,referenceDate,userUid:user.uid});
    const byId=new Map(context.preview.items.map(item=>[item.id,item]));
    const selected=itemIds.map(id=>byId.get(id)).filter((item):item is InvoicePreviewItem=>Boolean(item));
    if(selected.length!==itemIds.length) return error(res,400,'INVALID_INVOICE_SELECTION');
    if(selected.some(item=>item.needsReview.length>0)) return error(res,409,'INVOICE_REVIEW_REQUIRED');

    const itemEntries=selected.map(item=>{
      const key=invoiceItemDedupKey({cardId,invoiceKey:context.preview.invoiceKey,item});
      return {
        item,
        key,
        keyId:hash(key),
        transactionRef:context.household.collection('transactions').doc()
      };
    });

    const planGroups=new Map<string,{key:string;ref:FirebaseFirestore.DocumentReference;items:InvoicePreviewItem[]}>();
    for(const item of selected){
      const key=installmentPlanKey({cardId,item});
      if(!key) continue;
      const id=hash(key);
      const existing=planGroups.get(id);
      if(existing) existing.items.push(item);
      else planGroups.set(id,{key,ref:context.household.collection('installmentPlans').doc(id),items:[item]});
    }

    const importId=hash(`${cardId}|${context.evidenceId}|${context.preview.invoiceKey}`);
    const importRef=context.household.collection('invoiceImports').doc(importId);
    const auditRef=context.household.collection('auditEvents').doc();

    const planIds=[...planGroups.keys()];

    const transactionResult=await adminDb.runTransaction(async tx=>{
      let created=0;
      let duplicates=0;
      let createdAmountMinor=0;
      const itemKeyRefs=itemEntries.map(entry=>context.household.collection('invoiceItemKeys').doc(entry.keyId));
      const itemKeySnaps=await Promise.all(itemKeyRefs.map(ref=>tx.get(ref)));
      const planEntries=[...planGroups.entries()];
      const planSnaps=await Promise.all(planEntries.map(([,group])=>tx.get(group.ref)));
      const importSnap=await tx.get(importRef);

      const planSnapshots=new Map(planEntries.map(([id],index)=>[id,planSnaps[index]]));

      for(let index=0;index<itemEntries.length;index++){
        const entry=itemEntries[index];
        const keyRef=itemKeyRefs[index];
        if(itemKeySnaps[index].exists){
          duplicates++;
          continue;
        }

        const planKey=installmentPlanKey({cardId,item:entry.item});
        const planId=planKey?hash(planKey):null;

        tx.create(entry.transactionRef,{
          description:entry.item.description,
          amountMinor:entry.item.amountMinor,
          currency:'BRL',
          direction:'expense',
          source:'credit_card_invoice',
          sourceText:entry.item.sourceLine,
          confidence:entry.item.confidence,
          needsReview:[],
          evidenceIds:[context.evidenceId],
          cardId,
          invoiceKey:context.preview.invoiceKey,
          invoiceImportId:importId,
          invoiceDueOn:context.preview.dueOn,
          invoiceItemId:entry.item.id,
          cardEntryKind:entry.item.kind,
          installment:entry.item.installment,
          installmentPlanId:planId,
          createdBy:user.uid,
          createdAt:FieldValue.serverTimestamp(),
          observedOn:entry.item.purchaseOn,
          fingerprint:entry.key,
          status:'confirmed',
          recurring:false,
          recurrence:null,
          dueDay:null
        });

        tx.create(keyRef,{
          entityType:'transaction',
          transactionId:entry.transactionRef.id,
          cardId,
          invoiceKey:context.preview.invoiceKey,
          invoiceItemId:entry.item.id,
          fingerprint:entry.key,
          createdAt:FieldValue.serverTimestamp()
        });
        created++;
        createdAmountMinor+=entry.item.amountMinor;
      }

      for(const [planId,group] of planGroups){
        const snap=planSnapshots.get(planId)!;
        const observed=group.items
          .filter(item=>item.installment)
          .sort((a,b)=>b.installment!.current-a.installment!.current)[0];
        if(!observed?.installment||!observed.purchaseOn) continue;

        const previous=snap.exists?Number(snap.data()?.lastObservedInstallment||0):0;
        const current=Math.max(previous,observed.installment.current);
        const planData={
          cardId,
          description:observed.description,
          amountMinor:observed.amountMinor,
          currency:'BRL',
          firstPurchaseOn:observed.purchaseOn,
          totalInstallments:observed.installment.total,
          lastObservedInstallment:current,
          lastObservedInvoiceKey:current===observed.installment.current?context.preview.invoiceKey:(snap.data()?.lastObservedInvoiceKey||context.preview.invoiceKey),
          anchorDueOn:current===observed.installment.current?context.preview.dueOn:(snap.data()?.anchorDueOn||context.preview.dueOn),
          status:current>=observed.installment.total?'completed':'active',
          evidenceIds:FieldValue.arrayUnion(context.evidenceId),
          observedInvoiceKeys:FieldValue.arrayUnion(context.preview.invoiceKey),
          updatedAt:FieldValue.serverTimestamp()
        };

        if(snap.exists) tx.set(group.ref,planData,{merge:true});
        else tx.create(group.ref,{...planData,createdBy:user.uid,createdAt:FieldValue.serverTimestamp(),schemaVersion:1});
      }

      const allClear=context.preview.reviewCount===0;
      const status=allClear&&selected.length===context.preview.items.length?'confirmed':'partial';
      const importData=importSnap.exists?importSnap.data()||{}:{};
      const previousConfirmed=Number.isSafeInteger(importData.confirmedAmountMinor)?Number(importData.confirmedAmountMinor):0;
      const previousItemIds=Array.isArray(importData.confirmedItemIds)
        ? importData.confirmedItemIds.map((value:any)=>String(value||'')).filter(Boolean)
        : [];
      const allConfirmedIds=new Set([...previousItemIds,...selected.map(item=>item.id)]);
      const reconstructedConfirmed=context.preview.items
        .filter(item=>allConfirmedIds.has(item.id))
        .reduce((sum,item)=>sum+item.amountMinor,0);
      const confirmedAmountMinor=Math.max(previousConfirmed+createdAmountMinor,reconstructedConfirmed);
      const existingPaid=Number.isSafeInteger(importData.paidAmountMinor)?Number(importData.paidAmountMinor):0;
      tx.set(importRef,{
        cardId,
        evidenceId:context.evidenceId,
        invoiceKey:context.preview.invoiceKey,
        dueOn:context.preview.dueOn,
        parserVersion:context.preview.parserVersion,
        status,
        confirmedAmountMinor,
        paymentStatus:String(importData.paymentStatus||'unpaid'),
        paidAmountMinor:existingPaid,
        confirmedItemIds:FieldValue.arrayUnion(...selected.map(item=>item.id)),
        selectedCount:selected.length,
        lastCommittedBy:user.uid,
        updatedAt:FieldValue.serverTimestamp(),
        ...(importSnap.exists?{}:{createdBy:user.uid,createdAt:FieldValue.serverTimestamp(),schemaVersion:1})
      },{merge:true});

      tx.create(auditRef,{
        type:'credit_card_invoice.committed',
        actorUid:user.uid,
        cardId,
        evidenceId:context.evidenceId,
        invoiceKey:context.preview.invoiceKey,
        selectedCount:selected.length,
        createdCount:created,
        duplicateCount:duplicates,
        installmentPlanIds:planIds,
        createdAt:FieldValue.serverTimestamp()
      });

      return {created,duplicates,createdAmountMinor};
    });

    const {created,duplicates,createdAmountMinor}=transactionResult;

    return res.status(created>0?201:200).json({
      ok:true,
      status:created>0?'committed':'duplicate',
      invoiceKey:context.preview.invoiceKey,
      evidenceId:context.evidenceId,
      selected:selected.length,
      created,
      duplicates,
      createdAmountMinor,
      installmentPlans:planIds.length
    });
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
      'INVALID_CARD','INVALID_EVIDENCE','CARD_NOT_FOUND','CARD_NOT_ACTIVE',
      'EVIDENCE_NOT_FOUND','CANONICAL_EVIDENCE_NOT_FOUND','EVIDENCE_NOT_READY',
      'EVIDENCE_ANALYSIS_REQUIRED','INVOICE_TEXT_UNAVAILABLE','CARD_CYCLE_INVALID',
      'EMPTY_INVOICE_TEXT','INVALID_REFERENCE_DATE','INVALID_CLOSING_DAY','INVALID_DUE_DAY'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'INVOICE_COMMIT_FAILED');
  }
}


export async function payCreditCardInvoice(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const invoiceImportId=String(req.body?.invoiceImportId||'');
    const accountId=String(req.body?.accountId||'');
    const paidOn=/^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.paidOn||''))
      ? String(req.body.paidOn)
      : new Date().toISOString().slice(0,10);

    await requireHouseholdMember(householdId,user.uid);
    if(!validId(invoiceImportId)) return error(res,400,'INVALID_INVOICE_IMPORT');
    if(!validId(accountId)) return error(res,400,'INVALID_ACCOUNT');

    const household=adminDb.collection('households').doc(householdId);
    const importRef=household.collection('invoiceImports').doc(invoiceImportId);
    const accountRef=household.collection('accounts').doc(accountId);
    const paymentKeyId=hash(`invoice_payment|${invoiceImportId}`);
    const paymentKeyRef=household.collection('invoicePaymentKeys').doc(paymentKeyId);
    const paymentRef=household.collection('transactions').doc();
    const auditRef=household.collection('auditEvents').doc();

    const result=await adminDb.runTransaction(async tx=>{
      const [importSnap,accountSnap,keySnap]=await Promise.all([
        tx.get(importRef),
        tx.get(accountRef),
        tx.get(paymentKeyRef)
      ]);

      if(!importSnap.exists) fail('INVOICE_IMPORT_NOT_FOUND',404);
      if(!accountSnap.exists) fail('ACCOUNT_NOT_FOUND',404);

      const invoice=importSnap.data()!;
      const account=accountSnap.data()!;
      if(account.status!=='active') fail('ACCOUNT_NOT_ACTIVE',409);
      if(invoice.status!=='confirmed') fail('INVOICE_NOT_CONFIRMABLE',409);

      const amountMinor=Number(invoice.confirmedAmountMinor||0);
      if(!Number.isSafeInteger(amountMinor)||amountMinor<=0) fail('INVOICE_AMOUNT_INVALID',409);

      if(invoice.paymentStatus==='paid'||keySnap.exists){
        return {
          status:'duplicate' as const,
          transactionId:String(invoice.paymentTransactionId||keySnap.data()?.transactionId||''),
          amountMinor
        };
      }

      tx.create(paymentRef,{
        description:`Pagamento da fatura ${String(invoice.invoiceKey||'')}`.trim(),
        amountMinor,
        currency:'BRL',
        direction:'transfer',
        transferKind:'liability_settlement',
        source:'credit_card_invoice_payment',
        fromAccountId:accountId,
        cardId:String(invoice.cardId||''),
        invoiceImportId,
        invoiceKey:String(invoice.invoiceKey||''),
        evidenceIds:invoice.evidenceId?[String(invoice.evidenceId)]:[],
        createdBy:user.uid,
        createdAt:FieldValue.serverTimestamp(),
        observedOn:paidOn,
        status:'confirmed',
        recurring:false,
        recurrence:null,
        dueDay:null,
        installment:null
      });

      tx.create(paymentKeyRef,{
        transactionId:paymentRef.id,
        invoiceImportId,
        createdAt:FieldValue.serverTimestamp()
      });

      tx.update(importRef,{
        paymentStatus:'paid',
        paidAmountMinor:amountMinor,
        paidOn,
        paymentTransactionId:paymentRef.id,
        paidFromAccountId:accountId,
        paidBy:user.uid,
        updatedAt:FieldValue.serverTimestamp()
      });

      tx.create(auditRef,{
        type:'credit_card_invoice.paid',
        actorUid:user.uid,
        cardId:String(invoice.cardId||''),
        invoiceImportId,
        invoiceKey:String(invoice.invoiceKey||''),
        accountId,
        amountMinor,
        paymentTransactionId:paymentRef.id,
        createdAt:FieldValue.serverTimestamp()
      });

      return {status:'paid' as const,transactionId:paymentRef.id,amountMinor};
    });

    return res.status(result.status==='paid'?201:200).json({ok:true,...result,invoiceImportId,paidOn});
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
      'INVALID_INVOICE_IMPORT','INVALID_ACCOUNT','INVOICE_IMPORT_NOT_FOUND',
      'ACCOUNT_NOT_FOUND','ACCOUNT_NOT_ACTIVE','INVOICE_NOT_CONFIRMABLE','INVOICE_AMOUNT_INVALID'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'INVOICE_PAYMENT_FAILED');
  }
}
