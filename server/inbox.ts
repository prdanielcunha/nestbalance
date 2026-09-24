import type { Request, Response } from 'express';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { visibleDocs } from './privacy.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}
function millis(value:any){
  if(value&&typeof value.toMillis==='function') return Number(value.toMillis())||0;
  if(value instanceof Date) return value.getTime();
  return 0;
}
function scopeOf(data:any){return data?.scope==='personal'?'personal':'household';}

export async function getFinancialInbox(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const household=adminDb.collection('households').doc(householdId);

    const [evidence,transactions,commitments,invoices,accounts,pots,cardSnapshots]=await Promise.all([
      household.collection('evidenceAssets').orderBy('createdAt','desc').limit(100).get(),
      household.collection('transactions').orderBy('createdAt','desc').limit(120).get(),
      household.collection('commitments').orderBy('createdAt','desc').limit(120).get(),
      household.collection('invoiceImports').orderBy('updatedAt','desc').limit(80).get(),
      household.collection('accounts').limit(100).get(),
      household.collection('savingsPots').limit(100).get(),
      household.collection('cardSnapshots').limit(80).get()
    ]);

    const visibleTransactions=visibleDocs(transactions.docs,user.uid);
    const visibleCommitments=visibleDocs(commitments.docs,user.uid);
    const visibleInvoices=visibleDocs(invoices.docs,user.uid);
    const visibleAccounts=visibleDocs(accounts.docs,user.uid);
    const visiblePots=visibleDocs(pots.docs,user.uid);
    const visibleSnapshots=visibleDocs(cardSnapshots.docs,user.uid);
    const linkedEvidence=new Set<string>();

    for(const doc of [...visibleTransactions,...visibleCommitments]){
      const ids=Array.isArray(doc.data()?.evidenceIds)?doc.data().evidenceIds:[];
      for(const id of ids) if(id) linkedEvidence.add(String(id));
    }
    for(const doc of [...visibleInvoices,...visibleAccounts,...visiblePots,...visibleSnapshots]){
      const data=doc.data();
      for(const raw of [data.evidenceId,data.sourceEvidenceId,data.canonicalEvidenceId]){
        if(raw) linkedEvidence.add(String(raw));
      }
    }

    const items:any[]=[];
    for(const doc of visibleDocs(evidence.docs,user.uid)){
      const data=doc.data();
      const linked=linkedEvidence.has(doc.id)||linkedEvidence.has(String(data.canonicalEvidenceId||''));
      const status=String(data.status||'');
      const extraction=String(data.extractionState||'pending');
      const stage=status==='awaiting_upload'||(!linked&&extraction==='pending')
        ? 'processing'
        : linked||status==='duplicate'
          ? 'resolved'
          : 'review';
      items.push({
        id:'evidence:'+doc.id,
        kind:'document',
        stage,
        title:String(data.originalName||'Documento recebido'),
        secondary:stage==='processing'?'receiving_or_reading':stage==='review'?'document_needs_review':'document_linked',
        href:stage==='review'?'/add?return=/inbox':'/documents',
        scope:scopeOf(data),
        createdAtMs:millis(data.createdAt)||millis(data.finalizedAt)
      });
    }

    for(const doc of visibleInvoices){
      const data=doc.data();
      const status=String(data.status||'partial');
      items.push({
        id:'invoice:'+doc.id,
        kind:'invoice',
        stage:status==='partial'?'review':'resolved',
        title:String(data.invoiceKey||'Fatura'),
        secondary:status==='partial'?'invoice_partial':'invoice_ready',
        href:'/accounts',
        scope:scopeOf(data),
        createdAtMs:millis(data.updatedAt)||millis(data.createdAt)
      });
    }

    for(const [kind,docs] of [['movement',visibleTransactions],['commitment',visibleCommitments]] as const){
      for(const doc of docs){
        const data=doc.data();
        if(data.source!=='universal_capture') continue;
        const needs=Array.isArray(data.needsReview)?data.needsReview:[];
        items.push({
          id:kind+':'+doc.id,
          kind,
          stage:needs.length?'review':'resolved',
          title:String(data.description||(kind==='movement'?'Movimento':'Conta')),
          secondary:needs.length?'capture_needs_review':'capture_resolved',
          href:kind==='movement'?'/movements':'/',
          scope:scopeOf(data),
          createdAtMs:millis(data.createdAt)
        });
      }
    }

    items.sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0));
    const capped=items.slice(0,160);
    return res.json({
      ok:true,
      items:capped,
      counts:{
        review:capped.filter(item=>item.stage==='review').length,
        processing:capped.filter(item=>item.stage==='processing').length,
        resolved:capped.filter(item=>item.stage==='resolved').length
      }
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'FINANCIAL_INBOX_FAILED');
  }
}
