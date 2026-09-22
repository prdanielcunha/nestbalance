import { projectHouseholdFuture, type ProjectionCommitment, type ProjectionInstallmentPlan } from './future-projection.js';
import { categoryLabel, deriveFinancialAnomalies, deriveSpendingComparison, type InsightTransaction } from './insights.js';
import { assistantCopy } from './assistant-copy.js';
import type { Locale } from '../i18n/messages.js';

export type AssistantAccount={
  id:string;
  name:string;
  balanceMinor:number;
  status?:string;
};

export type AssistantCommitment=ProjectionCommitment&{
  id:string;
  description:string;
};

export type AssistantInvoice={
  id:string;
  cardId:string;
  invoiceKey:string;
  dueOn:string;
  status?:string;
  confirmedAmountMinor:number;
  paidAmountMinor?:number;
  paymentStatus?:string;
};

export type AssistantInstallmentPlan=ProjectionInstallmentPlan&{
  id:string;
  description?:string;
};

export type AssistantTransaction=InsightTransaction;

export type AssistantSource={
  kind:'account'|'commitment'|'invoice'|'installment_plan'|'projection'|'transaction';
  id:string;
  label:string;
  amountMinor:number;
  detail:string;
};

export type AssistantAnswer={
  intent:'remaining_to_pay'|'available_now'|'future_months'|'spending_simulation'|'ending_installments'|'spending_change'|'anomalies'|'unsupported';
  title:string;
  summary:string;
  answerMinor:number|null;
  sources:AssistantSource[];
  cards:Array<{label:string;amountMinor:number;detail:string}>;
  suggestions:string[];
};

function normalize(value:string){
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function positive(value:unknown){
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>0?n:0;
}

function formatMoneyMinor(value:number,locale:Locale){
  return new Intl.NumberFormat(locale==='en'?'en-US':locale,{style:'currency',currency:'BRL'}).format(value/100);
}

function parseHumanNumber(raw:string){
  const clean=raw.replace(/\s/g,'');
  const lastDot=clean.lastIndexOf('.');
  const lastComma=clean.lastIndexOf(',');
  let normalized=clean;

  if(lastDot>=0&&lastComma>=0){
    const decimalIndex=Math.max(lastDot,lastComma);
    const integer=clean.slice(0,decimalIndex).replace(/[.,]/g,'');
    const decimal=clean.slice(decimalIndex+1).replace(/[.,]/g,'');
    normalized=decimal.length<=2?`${integer}.${decimal}`:clean.replace(/[.,]/g,'');
  }else if(lastComma>=0){
    const decimal=clean.length-lastComma-1;
    normalized=decimal>=1&&decimal<=2?clean.replace(/\./g,'').replace(',','.') : clean.replace(/,/g,'');
  }else if(lastDot>=0){
    const decimal=clean.length-lastDot-1;
    normalized=decimal>=1&&decimal<=2?clean.replace(/,/g,'') : clean.replace(/\./g,'');
  }

  const number=Number(normalized);
  return Number.isFinite(number)?number:null;
}

function parseRequestedMoneyMinor(question:string){
  const normalized=question.normalize('NFKC').replace(/\s+/g,' ').trim();
  const currencyMatch=normalized.match(/(?:R\$|BRL)\s*([0-9][0-9.,]*)/i);
  const reaisMatch=normalized.match(/([0-9][0-9.,]*)\s*(?:reais?|conto(?:s)?)/i);
  const spendMatch=normalized.match(/(?:gastar|gasto|gastasse|gaste|spend|spending|gastar|gaste)\s*(?:de\s*)?([0-9][0-9.,]*)/i);
  const raw=(currencyMatch?.[1]||reaisMatch?.[1]||spendMatch?.[1]||'').trim();
  if(!raw) return null;
  const number=parseHumanNumber(raw);
  if(number===null||number<=0||number>100_000_000) return null;
  return Math.round(number*100);
}

export function classifyAssistantIntent(question:string):AssistantAnswer['intent']{
  const q=normalize(question);
  if(!q) return 'unsupported';

  if(
    /(?:da para gastar|posso gastar|consigo gastar|se eu gastar)/.test(q)||
    /(?:can i spend|could i spend|if i spend|can we spend)/.test(q)||
    /(?:puedo gastar|podemos gastar|si gasto|me alcanza para gastar)/.test(q)
  ) return 'spending_simulation';

  if(
    /por que.*gastei.*mais/.test(q)||
    /porque.*gastei.*mais/.test(q)||
    /gastei.*mais.*mes/.test(q)||
    /aumentou.*(?:gasto|despesa)/.test(q)||
    /why.*(?:spend|spent).*more/.test(q)||
    /(?:spending|expenses?).*(?:increase|higher|up)/.test(q)||
    /por que.*gaste.*mas/.test(q)||
    /gaste.*mas.*mes/.test(q)||
    /aumentaron?.*(?:gastos?|gasto)/.test(q)
  ) return 'spending_change';

  if(
    /o que.*estranh/.test(q)||
    /algo.*estranh/.test(q)||
    /cobranca.*(?:diferente|fora)/.test(q)||
    /duplicad/.test(q)||
    /what.*(?:unusual|strange|odd)/.test(q)||
    /anything.*(?:unusual|strange|odd)/.test(q)||
    /(?:duplicate|duplicated)/.test(q)||
    /que.*(?:raro|extrano|fuera.*normal)/.test(q)||
    /algo.*(?:raro|extrano)/.test(q)
  ) return 'anomalies';

  if(
    /parcelas?.*(?:terminam|acabam|finalizam)/.test(q)||
    /parcelamentos?.*(?:terminam|acabam|finalizam)/.test(q)||
    /quais .*parcelas?.*logo/.test(q)||
    /installments?.*(?:end|finish)/.test(q)||
    /which.*installments?.*(?:soon|first)/.test(q)||
    /cuotas?.*(?:terminan|acaban|finalizan)/.test(q)||
    /que.*cuotas?.*(?:pronto|primero)/.test(q)
  ) return 'ending_installments';

  if(
    /quanto .*falta.*pagar/.test(q)||
    /falta.*pagar/.test(q)||
    /ainda.*pagar/.test(q)||
    /contas?.*pendentes?/.test(q)||
    /quanto.*pendente/.test(q)||
    /ainda.*vai.*sair/.test(q)||
    /how much.*(?:left|still).*(?:pay|due)/.test(q)||
    /what.*(?:left|still).*(?:pay|due)/.test(q)||
    /pending (?:bills?|payments?)/.test(q)||
    /cuanto.*falta.*pagar/.test(q)||
    /todavia.*pagar/.test(q)||
    /cuentas?.*pendientes?/.test(q)
  ) return 'remaining_to_pay';

  if(
    /quanto.*tenho/.test(q)||
    /saldo.*disponivel/.test(q)||
    /quanto.*disponivel/.test(q)||
    /dinheiro.*disponivel/.test(q)||
    /how much.*(?:have|available)/.test(q)||
    /available balance/.test(q)||
    /money.*available/.test(q)||
    /cuanto.*tengo/.test(q)||
    /saldo.*disponible/.test(q)||
    /cuanto.*disponible/.test(q)
  ) return 'available_now';

  if(
    /proximos? meses?/.test(q)||
    /meses? seguintes?/.test(q)||
    /parcelas? futuras?/.test(q)||
    /quanto.*mes.*que vem/.test(q)||
    /next months?/.test(q)||
    /coming months?/.test(q)||
    /future installments?/.test(q)||
    /proximos? meses?/.test(q)||
    /meses? siguientes?/.test(q)||
    /cuotas? futuras?/.test(q)
  ) return 'future_months';

  return 'unsupported';
}

export function answerAssistantQuestion(input:{
  question:string;
  accounts:AssistantAccount[];
  transactions:AssistantTransaction[];
  commitments:AssistantCommitment[];
  invoices:AssistantInvoice[];
  installmentPlans:AssistantInstallmentPlan[];
  now:Date;
  locale?:Locale;
}):AssistantAnswer{
  const locale=input.locale||'pt-BR';
  const c=assistantCopy(locale);
  const intent=classifyAssistantIntent(input.question);

  if(intent==='spending_simulation'){
    const spendMinor=parseRequestedMoneyMinor(input.question);
    if(!spendMinor){
      return {
        intent,
        title:c.simulationNeedTitle,
        summary:c.simulationNeedSummary,
        answerMinor:null,
        sources:[],
        cards:[],
        suggestions:[c.s.spend,c.s.remaining,c.s.available]
      };
    }

    const accountSources=input.accounts
      .filter(account=>account.status!=='inactive')
      .map(account=>({
        kind:'account' as const,
        id:account.id,
        label:account.name,
        amountMinor:Number(account.balanceMinor)||0,
        detail:c.accountBalance
      }));
    const commitmentSources=input.commitments
      .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&positive(item.amountMinor)>0)
      .map(item=>({
        kind:'commitment' as const,
        id:item.id,
        label:item.description,
        amountMinor:positive(item.amountMinor),
        detail:c.openCommitment
      }));
    const invoiceSources=input.invoices
      .filter(item=>item.paymentStatus!=='paid'&&item.status!=='cancelled')
      .map(item=>({
        kind:'invoice' as const,
        id:item.id,
        label:c.invoice(item.invoiceKey),
        amountMinor:Math.max(0,positive(item.confirmedAmountMinor)-positive(item.paidAmountMinor)),
        detail:item.status==='partial'?c.invoicePartial:c.invoiceConfirmed
      }))
      .filter(item=>item.amountMinor>0);

    const availableMinor=accountSources.reduce((sum,item)=>sum+item.amountMinor,0);
    const obligationsMinor=[...commitmentSources,...invoiceSources].reduce((sum,item)=>sum+item.amountMinor,0);
    const afterSpendMinor=availableMinor-obligationsMinor-spendMinor;
    const partialInvoices=input.invoices.filter(item=>item.status==='partial'&&item.paymentStatus!=='paid').length;

    return {
      intent,
      title:c.simulationTitle(formatMoneyMinor(spendMinor,locale)),
      summary:c.simulationSummary(formatMoneyMinor(afterSpendMinor,locale),partialInvoices),
      answerMinor:afterSpendMinor,
      sources:[...accountSources,...commitmentSources,...invoiceSources].slice(0,40),
      cards:[
        {label:c.availableNow,amountMinor:availableMinor,detail:c.knownAccounts(accountSources.length)},
        {label:c.knownObligations,amountMinor:obligationsMinor,detail:c.openItems(commitmentSources.length+invoiceSources.length)},
        {label:c.simulatedSpend,amountMinor:spendMinor,detail:c.providedByYou},
        {label:c.projectedLeft,amountMinor:afterSpendMinor,detail:afterSpendMinor>=0?c.afterKnown:c.belowZero}
      ],
      suggestions:[c.s.remaining,c.s.ending,c.s.future]
    };
  }

  if(intent==='ending_installments'){
    const active=input.installmentPlans
      .filter(plan=>plan.status!=='completed'&&plan.status!=='cancelled')
      .map(plan=>({...plan,remaining:Math.max(0,Number(plan.totalInstallments||0)-Number(plan.lastObservedInstallment||0))}))
      .filter(plan=>plan.remaining>0&&positive(plan.amountMinor)>0)
      .sort((a,b)=>a.remaining-b.remaining||positive(b.amountMinor)-positive(a.amountMinor));

    if(!active.length){
      return {
        intent,
        title:c.noInstallmentsTitle,
        summary:c.noInstallmentsSummary,
        answerMinor:0,
        sources:[],
        cards:[],
        suggestions:[c.s.future,c.s.remaining,c.s.spend]
      };
    }

    const endingSoon=active.filter(plan=>plan.remaining<=3);
    const visible=active.slice(0,8);
    const releasedSoonMinor=endingSoon.reduce((sum,plan)=>sum+positive(plan.amountMinor),0);

    return {
      intent,
      title:endingSoon.length?c.endingTitle:c.closestTitle,
      summary:endingSoon.length?c.endingSummary(endingSoon.length,formatMoneyMinor(releasedSoonMinor,locale)):c.noneEndingSoon,
      answerMinor:endingSoon.length?releasedSoonMinor:null,
      sources:visible.map(plan=>({
        kind:'installment_plan' as const,
        id:plan.id,
        label:plan.description||c.installmentPurchase,
        amountMinor:positive(plan.amountMinor),
        detail:c.installmentsLeft(plan.remaining,Number(plan.totalInstallments||0))
      })),
      cards:visible.slice(0,6).map(plan=>({
        label:plan.description||c.installmentPurchase,
        amountMinor:positive(plan.amountMinor),
        detail:c.installmentsLeft(plan.remaining)
      })),
      suggestions:[c.s.spend,c.s.future,c.s.remaining]
    };
  }

  if(intent==='spending_change'){
    const comparison=deriveSpendingComparison(input.transactions,input.now);
    const moneyNow=formatMoneyMinor(comparison.currentMinor,locale);
    const moneyPrevious=formatMoneyMinor(comparison.previousMinor,locale);
    if(!comparison.hasComparableData){
      return {
        intent,
        title:c.noCompareTitle,
        summary:c.noCompareSummary,
        answerMinor:null,
        sources:[],
        cards:[{label:c.thisMonth,amountMinor:comparison.currentMinor,detail:c.knownSpending(comparison.currentCount)}],
        suggestions:[c.s.anomalies,c.s.remaining,c.s.spend]
      };
    }

    const increased=comparison.deltaMinor>0;
    const top=comparison.topIncreases.slice(0,3);
    const reason=c.topReason(top.map(item=>categoryLabel(item.category,locale)));
    const currentSources=input.transactions
      .filter(item=>item.direction==='expense'&&item.status!=='cancelled'&&item.source!=='credit_card_invoice_payment'&&String(item.observedOn||'').startsWith(comparison.currentMonthKey))
      .sort((a,b)=>b.amountMinor-a.amountMinor)
      .slice(0,20)
      .map(item=>({
        kind:'transaction' as const,
        id:item.id,
        label:item.description,
        amountMinor:item.amountMinor,
        detail:c.observedThisMonth
      }));

    return {
      intent,
      title:increased
        ? c.spentMore(formatMoneyMinor(comparison.deltaMinor,locale))
        : comparison.deltaMinor<0
          ? c.spentLess(formatMoneyMinor(Math.abs(comparison.deltaMinor),locale))
          : c.sameLevel,
      summary:c.spendingSummary(moneyNow,moneyPrevious,reason),
      answerMinor:comparison.deltaMinor,
      sources:currentSources,
      cards:[
        {label:c.thisMonth,amountMinor:comparison.currentMinor,detail:c.knownSpending(comparison.currentCount)},
        {label:c.previousMonth,amountMinor:comparison.previousMinor,detail:c.knownSpending(comparison.previousCount)},
        ...top.map(item=>({
          label:categoryLabel(item.category,locale),
          amountMinor:item.deltaMinor,
          detail:c.categoryIncrease(formatMoneyMinor(item.previousMinor,locale),formatMoneyMinor(item.currentMinor,locale))
        }))
      ],
      suggestions:[c.s.anomalies,c.s.remaining,c.s.ending]
    };
  }

  if(intent==='anomalies'){
    const anomalies=deriveFinancialAnomalies(input.transactions,input.now);
    if(!anomalies.length){
      return {
        intent,
        title:c.noAnomaliesTitle,
        summary:c.noAnomaliesSummary,
        answerMinor:null,
        sources:[],
        cards:[],
        suggestions:[c.s.change,c.s.remaining,c.s.future]
      };
    }

    return {
      intent,
      title:c.anomalyTitle(anomalies.length),
      summary:c.anomalySummary,
      answerMinor:null,
      sources:anomalies.map(item=>({
        kind:'transaction' as const,
        id:item.transactionId,
        label:item.description,
        amountMinor:item.amountMinor,
        detail:item.type==='possible_duplicate'?c.duplicateSignalDetail:c.spikeSignalDetail
      })),
      cards:anomalies.slice(0,6).map(item=>({
        label:item.type==='possible_duplicate'?c.possibleDuplicate:c.differentNormal,
        amountMinor:item.amountMinor,
        detail:item.baselineMinor
          ? c.typicalHistory(formatMoneyMinor(item.baselineMinor,locale),formatMoneyMinor(item.differenceMinor||0,locale))
          : item.type==='possible_duplicate'?c.duplicateSignalDetail:c.spikeSignalDetail
      })),
      suggestions:[c.s.change,c.s.remaining,c.s.ending]
    };
  }

  if(intent==='remaining_to_pay'){
    const commitmentSources=input.commitments
      .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&positive(item.amountMinor)>0)
      .map(item=>({
        kind:'commitment' as const,
        id:item.id,
        label:item.description,
        amountMinor:positive(item.amountMinor),
        detail:c.pendingCommitment
      }));

    const invoiceSources=input.invoices
      .filter(item=>item.paymentStatus!=='paid'&&item.status!=='cancelled')
      .map(item=>{
        const open=Math.max(0,positive(item.confirmedAmountMinor)-positive(item.paidAmountMinor));
        return {
          kind:'invoice' as const,
          id:item.id,
          label:c.invoice(item.invoiceKey),
          amountMinor:open,
          detail:item.status==='partial'?c.invoicePartialDetail:c.invoiceOpenDetail
        };
      })
      .filter(item=>item.amountMinor>0);

    const sources=[...commitmentSources,...invoiceSources];
    const total=sources.reduce((sum,item)=>sum+item.amountMinor,0);
    const partialInvoices=invoiceSources.filter(source=>input.invoices.find(invoice=>invoice.id===source.id)?.status==='partial').length;

    return {
      intent,
      title:total>0?c.remainingTitle:c.nothingPending,
      summary:total>0?c.remainingSummary(sources.length,partialInvoices):c.nothingPendingSummary,
      answerMinor:total,
      sources:sources.sort((a,b)=>b.amountMinor-a.amountMinor).slice(0,30),
      cards:[
        {label:c.commitments,amountMinor:commitmentSources.reduce((sum,item)=>sum+item.amountMinor,0),detail:c.pendingItems(commitmentSources.length)},
        {label:c.openBills,amountMinor:invoiceSources.reduce((sum,item)=>sum+item.amountMinor,0),detail:c.knownBills(invoiceSources.length)}
      ],
      suggestions:[c.s.available,c.s.future]
    };
  }

  if(intent==='available_now'){
    const sources=input.accounts
      .filter(account=>account.status!=='inactive')
      .map(account=>({
        kind:'account' as const,
        id:account.id,
        label:account.name,
        amountMinor:Number(account.balanceMinor)||0,
        detail:c.accountCurrent
      }));
    const total=sources.reduce((sum,item)=>sum+item.amountMinor,0);

    return {
      intent,
      title:c.availableTitle,
      summary:sources.length?c.availableSummary(sources.length):c.noAvailable,
      answerMinor:total,
      sources,
      cards:sources.slice(0,6).map(item=>({label:item.label,amountMinor:item.amountMinor,detail:item.detail})),
      suggestions:[c.s.remaining,c.s.future]
    };
  }

  if(intent==='future_months'){
    const projection=projectHouseholdFuture(input.commitments,input.installmentPlans,input.now,3);
    const total=projection.reduce((sum,item)=>sum+item.totalMinor,0);
    const monthFmt=new Intl.DateTimeFormat(locale==='en'?'en-US':locale,{month:'long',year:'numeric'});
    return {
      intent,
      title:c.futureTitle,
      summary:c.futureSummary,
      answerMinor:total,
      sources:[
        ...input.commitments
          .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&item.recurring===true&&item.recurrence==='monthly')
          .map(item=>({
            kind:'commitment' as const,
            id:item.id,
            label:item.description,
            amountMinor:positive(item.amountMinor),
            detail:c.monthlyBill
          })),
        ...input.installmentPlans
          .filter(plan=>plan.status!=='completed'&&plan.status!=='cancelled')
          .map(plan=>({
            kind:'installment_plan' as const,
            id:plan.id,
            label:plan.description||c.installmentPurchase,
            amountMinor:positive(plan.amountMinor),
            detail:c.installmentObserved(Number(plan.lastObservedInstallment||0),Number(plan.totalInstallments||0))
          }))
      ].slice(0,30),
      cards:projection.map(month=>({
        label:monthFmt.format(new Date(month.year,month.monthIndex,1)),
        amountMinor:month.totalMinor,
        detail:c.knownCommitments(month.itemCount)
      })),
      suggestions:[c.s.remaining,c.s.available]
    };
  }

  return {
    intent:'unsupported',
    title:c.unsupportedTitle,
    summary:c.unsupportedSummary,
    answerMinor:null,
    sources:[],
    cards:[],
    suggestions:[c.s.change,c.s.anomalies,c.s.spend,c.s.ending,c.s.remaining,c.s.available,c.s.future]
  };
}
