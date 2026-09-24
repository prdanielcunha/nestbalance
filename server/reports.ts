import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { visibleDocs } from './privacy.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function csvCell(value:unknown){
  const text=String(value??'');
  return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}

function safePeriod(value:unknown){
  const period=String(value||'');
  return /^\d{4}-\d{2}$/.test(period)?period:null;
}

function positiveInt(value:unknown){
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>0?n:0;
}

function sharedOnly(doc:any){
  return doc.data()?.scope!=='personal';
}

function aggregateMonth(transactions:any[],commitments:any[],periodKey:string){
  let incomeMinor=0;
  let expenseMinor=0;
  let transactionCount=0;
  for(const doc of transactions){
    const data=doc.data();
    if(String(data.observedOn||'').slice(0,7)!==periodKey||data.status==='cancelled') continue;
    const amount=positiveInt(data.amountMinor);
    if(data.direction==='income') incomeMinor+=amount;
    else if(data.direction==='expense'&&data.source!=='credit_card_invoice_payment') expenseMinor+=amount;
    transactionCount++;
  }
  let openCommitmentsMinor=0;
  let openCommitmentsCount=0;
  for(const doc of commitments){
    const data=doc.data();
    if(data.status==='cancelled'||data.status==='paid') continue;
    openCommitmentsMinor+=positiveInt(data.amountMinor);
    openCommitmentsCount++;
  }
  return {periodKey,incomeMinor,expenseMinor,transactionCount,openCommitmentsMinor,openCommitmentsCount};
}

export async function exportAccountingCsv(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const periodKey=safePeriod(req.body?.periodKey);
    await requireHouseholdMember(householdId,user.uid,'read');
    if(!periodKey) return error(res,400,'INVALID_PERIOD');

    const household=adminDb.collection('households').doc(householdId);
    const [transactions,commitments]=await Promise.all([
      household.collection('transactions').orderBy('observedOn','asc').limit(2000).get(),
      household.collection('commitments').limit(1000).get()
    ]);

    const rows=[['data','tipo','descricao','valor_centavos','moeda','direcao','escopo','status','origem']];
    for(const doc of visibleDocs(transactions.docs,user.uid)){
      const data=doc.data();
      if(String(data.observedOn||'').slice(0,7)!==periodKey) continue;
      rows.push([
        String(data.observedOn||''),
        'movimento',
        String(data.description||''),
        String(Number(data.amountMinor)||0),
        String(data.currency||'BRL'),
        String(data.direction||''),
        data.scope==='personal'?'pessoal':'lar',
        String(data.status||'confirmed'),
        String(data.source||'manual')
      ]);
    }
    for(const doc of visibleDocs(commitments.docs,user.uid)){
      const data=doc.data();
      rows.push([
        '',
        'compromisso',
        String(data.description||''),
        String(Number(data.amountMinor)||0),
        String(data.currency||'BRL'),
        String(data.direction||'expense'),
        data.scope==='personal'?'pessoal':'lar',
        String(data.status||'pending'),
        String(data.source||'manual')
      ]);
    }

    const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
    await household.collection('auditEvents').add({
      type:'report.accounting_exported',
      actorUid:user.uid,
      entityType:'accounting_report',
      entityId:periodKey,
      createdAt:FieldValue.serverTimestamp()
    });

    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="nestbalance-contabil-${periodKey}.csv"`);
    return res.status(200).send(csv);
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'ACCOUNTING_EXPORT_FAILED');
  }
}

export async function createSharedMonthlyReport(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const periodKey=safePeriod(req.body?.periodKey);
    await requireHouseholdMember(householdId,user.uid,'read');
    if(!periodKey) return error(res,400,'INVALID_PERIOD');

    const household=adminDb.collection('households').doc(householdId);
    const [transactions,commitments]=await Promise.all([
      household.collection('transactions').orderBy('createdAt','desc').limit(1500).get(),
      household.collection('commitments').limit(1000).get()
    ]);
    const summary=aggregateMonth(
      transactions.docs.filter(sharedOnly),
      commitments.docs.filter(sharedOnly),
      periodKey
    );
    const token=randomBytes(32).toString('base64url');
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const expiresAtMs=Date.now()+7*24*60*60*1000;
    const ref=adminDb.collection('sharedReports').doc(tokenHash);
    await ref.create({
      product:'NestBalance',
      kind:'monthly_household_summary',
      periodKey,
      summary,
      createdBy:user.uid,
      createdAt:FieldValue.serverTimestamp(),
      expiresAtMs,
      revoked:false,
      schemaVersion:1
    });
    await household.collection('auditEvents').add({
      type:'report.share_created',
      actorUid:user.uid,
      entityType:'shared_report',
      entityId:tokenHash.slice(0,16),
      createdAt:FieldValue.serverTimestamp()
    });
    return res.status(201).json({ok:true,token,expiresAtMs,summary});
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SHARED_REPORT_CREATE_FAILED');
  }
}

export async function viewSharedMonthlyReport(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const token=String(req.body?.token||'');
    if(!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return error(res,400,'INVALID_SHARED_REPORT');
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const snap=await adminDb.collection('sharedReports').doc(tokenHash).get();
    if(!snap.exists) return error(res,404,'SHARED_REPORT_NOT_FOUND');
    const data=snap.data()||{};
    if(data.revoked===true||Number(data.expiresAtMs||0)<=Date.now()) return error(res,410,'SHARED_REPORT_EXPIRED');
    return res.json({
      ok:true,
      report:{
        product:'NestBalance',
        kind:'monthly_household_summary',
        periodKey:String(data.periodKey||''),
        summary:data.summary&&typeof data.summary==='object'?data.summary:{},
        expiresAtMs:Number(data.expiresAtMs)||0
      }
    });
  }catch{
    return error(res,500,'SHARED_REPORT_LOAD_FAILED');
  }
}
