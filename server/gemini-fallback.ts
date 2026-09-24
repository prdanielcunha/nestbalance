import type { Request, Response } from 'express';
import { redactFinancialText } from '../src/core/financial-redaction.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { extractWithGeminiFree, geminiFreeModel, isGeminiFreeConfigured } from './ai/gemini-free.js';
import { aiGatewayLimits, runAiGateway } from './ai/gateway.js';

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
      model:geminiFreeModel(),
      consentVersion:CONSENT_VERSION,
      imageSent:false,
      dailyCap:dailyCap(),
      gateway:{enabled:process.env.NESTBALANCE_AI_GATEWAY_ENABLED!=='false',...aiGatewayLimits()}
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

    const result=await runAiGateway({
      householdId,
      userUid:user.uid,
      provider:'gemini',
      task:'redacted_text',
      model:geminiFreeModel(),
      promptVersion:'gemini-redacted-text-v1',
      fingerprint:redacted.text,
      maxGlobalRequests:dailyCap()
    },()=>extractWithGeminiFree(redacted.text));

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
      quota:{dailyCap:dailyCap()}
    });
  }catch(err:any){
    const safe=[
      'AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED',
      'GEMINI_FREE_NOT_CONFIGURED','GEMINI_FREE_CONSENT_REQUIRED',
      'GEMINI_FREE_TEXT_REQUIRED','GEMINI_FREE_TEXT_TOO_LARGE','GEMINI_FREE_TEXT_EMPTY_AFTER_REDACTION',
      'GEMINI_FREE_DAILY_CAP_REACHED','GEMINI_FREE_QUOTA_EXHAUSTED',
      'AI_GATEWAY_DISABLED','AI_PROVIDER_DISABLED','AI_TASK_DISABLED','AI_CIRCUIT_OPEN',
      'AI_GLOBAL_REQUEST_CAP_REACHED','AI_GLOBAL_BUDGET_REACHED','AI_HOUSEHOLD_BUDGET_REACHED','AI_USER_BUDGET_REACHED'
    ];
    return error(res,err.statusCode||500,safe.includes(err?.message)?err.message:'GEMINI_FREE_FAILED');
  }
}
