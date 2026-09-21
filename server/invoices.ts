import type { Request, Response } from 'express';
import { parseInvoiceText } from '../src/core/invoices.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

const EXTRACTION_VERSION='native-text-v1';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function validId(value:string){
  return /^[A-Za-z0-9_-]{6,128}$/.test(value);
}

export async function previewCreditCardInvoice(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const cardId=String(req.body?.cardId||'');
    let evidenceId=String(req.body?.evidenceId||'');
    const referenceDate=/^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.referenceDate||''))
      ? String(req.body.referenceDate)
      : new Date().toISOString().slice(0,10);

    await requireHouseholdMember(householdId,user.uid);
    if(!validId(cardId)) return error(res,400,'INVALID_CARD');
    if(!validId(evidenceId)) return error(res,400,'INVALID_EVIDENCE');

    const household=adminDb.collection('households').doc(householdId);
    const [cardSnap,evidenceSnap]=await Promise.all([
      household.collection('creditCards').doc(cardId).get(),
      household.collection('evidenceAssets').doc(evidenceId).get()
    ]);

    if(!cardSnap.exists) return error(res,404,'CARD_NOT_FOUND');
    const card=cardSnap.data()!;
    if(card.status!=='active') return error(res,409,'CARD_NOT_ACTIVE');

    if(!evidenceSnap.exists) return error(res,404,'EVIDENCE_NOT_FOUND');
    let evidence=evidenceSnap.data()!;
    if(evidence.status==='duplicate'&&evidence.canonicalEvidenceId){
      evidenceId=String(evidence.canonicalEvidenceId);
      const canonical=await household.collection('evidenceAssets').doc(evidenceId).get();
      if(!canonical.exists) return error(res,404,'CANONICAL_EVIDENCE_NOT_FOUND');
      evidence=canonical.data()!;
    }
    if(evidence.status!=='accepted'||evidence.immutable!==true) return error(res,409,'EVIDENCE_NOT_READY');

    const extraction=await household.collection('evidenceAssets').doc(evidenceId)
      .collection('extractions').doc(EXTRACTION_VERSION).get();
    if(!extraction.exists) return error(res,409,'EVIDENCE_ANALYSIS_REQUIRED');

    const extracted=extraction.data()!;
    if(extracted.state!=='extracted'||typeof extracted.text!=='string'||!extracted.text.trim()){
      return error(res,409,'INVOICE_TEXT_UNAVAILABLE');
    }

    const closingDay=Number(card.closingDay);
    const dueDay=Number(card.dueDay);
    if(!Number.isInteger(closingDay)||!Number.isInteger(dueDay)) return error(res,409,'CARD_CYCLE_INVALID');

    const preview=parseInvoiceText({
      text:extracted.text,
      closingDay,
      dueDay,
      referenceDate
    });

    return res.json({
      ok:true,
      evidenceId,
      card:{
        id:cardSnap.id,
        name:String(card.name||'Cartão'),
        brand:String(card.brand||'other'),
        closingDay,
        dueDay,
        last4:typeof card.last4==='string'?card.last4:null
      },
      preview
    });
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
      'EMPTY_INVOICE_TEXT','INVALID_REFERENCE_DATE','INVALID_CLOSING_DAY','INVALID_DUE_DAY'
    ];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'INVOICE_PREVIEW_FAILED');
  }
}
