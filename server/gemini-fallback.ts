import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { redactFinancialText } from '../src/core/financial-redaction.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { extractWithGeminiFree, isGeminiFreeConfigured } from './ai/gemini-free.js';

const CONSENT_VERSION='gemini-free-redacted-text-v1';
const DEFAULT_DAILY_CAP=100;

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function dailyCap(){
  const configured=Number(process.env.NESTBALANCE_GEMINI_FREE_DAILY_CAP||DEFAULT_DAILY_CAP);
  if(!Number.isInteger(configured)||configured<1) return DEFAULT_DAILY_CAP;
  return Math.min(configured,500);
}

async function reserveDailyRequest(){
  const date=new Date().toISOString().slice(0,10);
  const ref=adminDb.collection('_nestbalanceRuntime').doc(`gemini-free-${date}`);
  const cap=dailyCap();
  await adminDb.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const count=Number(snap.data()?.count||0);
    if(count>=cap) throw Object.assign(new Error('GEMINI_FREE_DAILY_CAP_REACHED'),{statusCode:429});
    tx.set(ref,{
      count:count+1,
      cap,
      date,
      provider:'gemini_free_redacted_text',
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
  });
  return {date,cap};
}

export async function getGeminiFallbackStatus(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');
    return res.json({
      ok:true,
      configured:isGeminiFreeConfigured(),
      provider:'gemini_free_redacted_text',
      model:'gemini-2.5-flash-lite',
      consentVersion:CONSENT_VERSION,
      imageSent:false,
      dailyCap:dailyCap()
    });
  }catch(err:any){
    return error(res,err.statusCode||500,['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'].includes(err?.message)?err.message:'GEMINI_STATUS_FAILED');
  }
}

export async function analyzeRedactedTextWithGemini(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'contribute');

    if(!isGeminiFreeConfigured()) return error(res,503,'GEMINI_FREE_NOT_CONFIGURED');
    if(req.body?.consentAccepted!==true||req.body?.consentVersion!==CONSENT_VERSION){
      return error(res,400,'GEMINI_FREE_CONSENT_REQUIRED');
    }

    const source=String(req.body?.text||'');
    if(source.trim().length<3) return error(res,400,'GEMINI_FREE_TEXT_REQUIRED');
    if(source.length>50_000) return error(res,413,'GEMINI_FREE_TEXT_TOO_LARGE');

    const redacted=redactFinancialText(source);
    if(redacted.text.length<3) return error(res,400,'GEMINI_FREE_TEXT_EMPTY_AFTER_REDACTION');

    const quota=await reserveDailyRequest();
    const result=await extractWithGeminiFree(redacted.text);

    return res.json({
      ok:true,
      provider:result.provider,
      model:result.model,
      extraction:result.extraction,
      privacy:{
        imageSent:false,
        textRedacted:true,
        redactionCount:redacted.redactionCount,
        truncated:redacted.truncated,
        consentVersion:CONSENT_VERSION
      },
      quota:{dailyCap:quota.cap}
    });
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
      'GEMINI_FREE_NOT_CONFIGURED','GEMINI_FREE_CONSENT_REQUIRED',
      'GEMINI_FREE_TEXT_REQUIRED','GEMINI_FREE_TEXT_TOO_LARGE','GEMINI_FREE_TEXT_EMPTY_AFTER_REDACTION',
      'GEMINI_FREE_DAILY_CAP_REACHED','GEMINI_FREE_QUOTA_EXHAUSTED'
    ];
    return error(res,err.statusCode||500,safe.includes(err?.message)?err.message:'GEMINI_FREE_FAILED');
  }
}
