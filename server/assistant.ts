import type { Request, Response } from 'express';
import { answerAssistantQuestion } from '../src/core/assistant.js';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { visibleDocs } from './privacy.js';
import { normalizeFinancialScope } from '../src/core/privacy.js';
import { normalizeLocale } from '../src/core/locale.js';
import { categoryFromRecordAndRules, learnedCategoryRuleFromDoc, type LearnedCategoryRule } from './category-rules.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function accountDto(doc:any){
  const data=doc.data();
  return {
    id:doc.id,
    name:String(data.name||'Conta'),
    balanceMinor:Number(data.balanceMinor??data.amountMinor??0),
    status:String(data.status||'active')
  };
}

function transactionDto(doc:any,categoryRules:LearnedCategoryRule[]=[]){
  const data=doc.data();
  return {
    id:doc.id,
    description:String(data.description||'Movimento'),
    amountMinor:Number(data.amountMinor||0),
    direction:data.direction||'expense',
    source:typeof data.source==='string'?data.source:null,
    status:String(data.status||'confirmed'),
    observedOn:typeof data.observedOn==='string'?data.observedOn:null,
    category:categoryFromRecordAndRules(data,categoryRules)
  };
}

function commitmentDto(doc:any,paidThisMonth=false){
  const data=doc.data();
  return {
    id:doc.id,
    description:String(data.description||'Compromisso'),
    amountMinor:Number(data.amountMinor||0),
    status:String(data.status||'pending'),
    recurring:Boolean(data.recurring),
    recurrence:data.recurrence||null,
    installment:data.installment&&Number.isInteger(data.installment.current)&&Number.isInteger(data.installment.total)
      ? {current:data.installment.current,total:data.installment.total}
      : null,
    installmentPlanId:typeof data.installmentPlanId==='string'?data.installmentPlanId:null,
    paidThisMonth
  };
}

function invoiceDto(doc:any){
  const data=doc.data();
  return {
    id:doc.id,
    cardId:String(data.cardId||''),
    invoiceKey:String(data.invoiceKey||''),
    dueOn:String(data.dueOn||''),
    status:String(data.status||'partial'),
    confirmedAmountMinor:Number(data.confirmedAmountMinor||0),
    paidAmountMinor:Number(data.paidAmountMinor||0),
    paymentStatus:String(data.paymentStatus||'unpaid')
  };
}

function planDto(doc:any){
  const data=doc.data();
  return {
    id:doc.id,
    description:String(data.description||'Compra parcelada'),
    amountMinor:Number(data.amountMinor||0),
    status:String(data.status||'active'),
    totalInstallments:Number(data.totalInstallments||0),
    lastObservedInstallment:Number(data.lastObservedInstallment||0),
    anchorDueOn:String(data.anchorDueOn||'')
  };
}

export async function answerFinanceAssistant(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    const question=String(req.body?.question||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    const requestedView=req.body?.view==='personal'?'personal':req.body?.view==='all'?'all':'household';
    if(!question||question.length>400) return error(res,400,'INVALID_ASSISTANT_QUESTION');

    await requireHouseholdMember(householdId,user.uid);
    const household=adminDb.collection('households').doc(householdId);
    const currentMonthKey=new Date().toISOString().slice(0,7);

    const [householdSnap,accounts,transactions,commitments,invoices,plans,categoryRulesSnap,commitmentPayments]=await Promise.all([
      household.get(),
      household.collection('accounts').where('status','==','active').limit(50).get(),
      household.collection('transactions').orderBy('createdAt','desc').limit(500).get(),
      household.collection('commitments').orderBy('createdAt','desc').limit(150).get(),
      household.collection('invoiceImports').orderBy('updatedAt','desc').limit(100).get(),
      household.collection('installmentPlans').where('status','==','active').limit(100).get(),
      household.collection('categoryRules').limit(200).get(),
      household.collection('commitmentPayments').where('periodKey','==',currentMonthKey).limit(200).get()
    ]);

    const scoped=(docs:any[])=>visibleDocs(docs,user.uid).filter(doc=>
      requestedView==='all'||normalizeFinancialScope(doc.data()?.scope)===requestedView
    );

    const categoryRules=categoryRulesSnap.docs
      .map(learnedCategoryRuleFromDoc)
      .filter((rule):rule is LearnedCategoryRule=>Boolean(rule))
      .filter(rule=>rule.scope==='household'||rule.ownerUid===user.uid);

    const paidThisMonth=new Set(
      visibleDocs(commitmentPayments.docs,user.uid)
        .filter(doc=>String(doc.data().status||'paid')!=='reversed')
        .map(doc=>String(doc.data().commitmentId||''))
        .filter(Boolean)
    );

    const locale=normalizeLocale(householdSnap.data()?.locale);
    const answer=answerAssistantQuestion({
      question,
      locale,
      accounts:scoped(accounts.docs).map(accountDto),
      transactions:scoped(transactions.docs).map(doc=>transactionDto(doc,categoryRules)),
      commitments:scoped(commitments.docs).map(doc=>commitmentDto(doc,paidThisMonth.has(doc.id))),
      invoices:scoped(invoices.docs).map(invoiceDto),
      installmentPlans:scoped(plans.docs).map(planDto),
      now:new Date()
    });

    return res.json({
      ok:true,
      answer,
      grounded:true,
      view:requestedView,
      locale,
      asOf:new Date().toISOString()
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'ASSISTANT_ANSWER_FAILED');
  }
}
