import { projectHouseholdFuture, type ProjectionCommitment, type ProjectionInstallmentPlan } from './future-projection.js';
import { categoryLabel, deriveFinancialAnomalies, deriveSpendingComparison, type InsightTransaction } from './insights.js';

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

function formatMoneyMinor(value:number){
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
}

function parseRequestedMoneyMinor(question:string){
  const normalized=question.normalize('NFKC').replace(/\s+/g,' ').trim();
  const currencyMatch=normalized.match(/R\$\s*([0-9.]+(?:,[0-9]{1,2})?)/i);
  const reaisMatch=normalized.match(/([0-9.]+(?:,[0-9]{1,2})?)\s*(?:reais?|conto(?:s)?)/i);
  const spendMatch=normalized.match(/(?:gastar|gasto|gastasse)\s*(?:de\s*)?([0-9.]+(?:,[0-9]{1,2})?)/i);
  const raw=(currencyMatch?.[1]||reaisMatch?.[1]||spendMatch?.[1]||'').trim();
  if(!raw) return null;
  const number=Number(raw.replace(/\./g,'').replace(',','.'));
  if(!Number.isFinite(number)||number<=0||number>100_000_000) return null;
  return Math.round(number*100);
}

export function classifyAssistantIntent(question:string):AssistantAnswer['intent']{
  const q=normalize(question);
  if(!q) return 'unsupported';

  if(
    /(?:da|dá) para gastar/.test(q)||
    /posso gastar/.test(q)||
    /consigo gastar/.test(q)||
    /se eu gastar/.test(q)
  ) return 'spending_simulation';

  if(
    /por que.*gastei.*mais/.test(q)||
    /porque.*gastei.*mais/.test(q)||
    /gastei.*mais.*(?:mes|mês)/.test(q)||
    /aumentou.*(?:gasto|despesa)/.test(q)
  ) return 'spending_change';

  if(
    /o que.*estranh/.test(q)||
    /algo.*estranh/.test(q)||
    /cobranca.*(?:diferente|fora)/.test(q)||
    /cobrança.*(?:diferente|fora)/.test(q)||
    /duplicad/.test(q)
  ) return 'anomalies';

  if(
    /parcelas?.*(?:terminam|acabam|finalizam)/.test(q)||
    /parcelamentos?.*(?:terminam|acabam|finalizam)/.test(q)||
    /quais .*parcelas?.*logo/.test(q)
  ) return 'ending_installments';

  if(
    /quanto .*falta.*pagar/.test(q)||
    /falta.*pagar/.test(q)||
    /ainda.*pagar/.test(q)||
    /contas?.*pendentes?/.test(q)||
    /quanto.*pendente/.test(q)||
    /ainda.*vai.*sair/.test(q)
  ) return 'remaining_to_pay';

  if(
    /quanto.*tenho/.test(q)||
    /saldo.*disponivel/.test(q)||
    /quanto.*disponivel/.test(q)||
    /dinheiro.*disponivel/.test(q)
  ) return 'available_now';

  if(
    /proximos? meses?/.test(q)||
    /meses? seguintes?/.test(q)||
    /parcelas? futuras?/.test(q)||
    /quanto.*mes.*que vem/.test(q)
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
}):AssistantAnswer{
  const intent=classifyAssistantIntent(input.question);

  if(intent==='spending_simulation'){
    const spendMinor=parseRequestedMoneyMinor(input.question);
    if(!spendMinor){
      return {
        intent,
        title:'Qual valor você quer simular?',
        summary:'Escreva o valor na própria pergunta, por exemplo: “Dá para gastar R$ 500?”.',
        answerMinor:null,
        sources:[],
        cards:[],
        suggestions:['Dá para gastar R$ 500?','Quanto ainda falta pagar?','Quanto tenho disponível?']
      };
    }

    const accountSources=input.accounts
      .filter(account=>account.status!=='inactive')
      .map(account=>({
        kind:'account' as const,
        id:account.id,
        label:account.name,
        amountMinor:Number(account.balanceMinor)||0,
        detail:'Saldo atual conhecido'
      }));
    const commitmentSources=input.commitments
      .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&positive(item.amountMinor)>0)
      .map(item=>({
        kind:'commitment' as const,
        id:item.id,
        label:item.description,
        amountMinor:positive(item.amountMinor),
        detail:'Compromisso aberto conhecido'
      }));
    const invoiceSources=input.invoices
      .filter(item=>item.paymentStatus!=='paid'&&item.status!=='cancelled')
      .map(item=>({
        kind:'invoice' as const,
        id:item.id,
        label:`Fatura ${item.invoiceKey}`,
        amountMinor:Math.max(0,positive(item.confirmedAmountMinor)-positive(item.paidAmountMinor)),
        detail:item.status==='partial'?'Fatura ainda em revisão':'Fatura aberta confirmada'
      }))
      .filter(item=>item.amountMinor>0);

    const availableMinor=accountSources.reduce((sum,item)=>sum+item.amountMinor,0);
    const obligationsMinor=[...commitmentSources,...invoiceSources].reduce((sum,item)=>sum+item.amountMinor,0);
    const afterSpendMinor=availableMinor-obligationsMinor-spendMinor;
    const partialInvoices=input.invoices.filter(item=>item.status==='partial'&&item.paymentStatus!=='paid').length;

    return {
      intent,
      title:`Simulação de ${formatMoneyMinor(spendMinor)}`,
      summary:`Com os saldos e obrigações conhecidos agora, depois desse gasto a projeção ficaria em ${formatMoneyMinor(afterSpendMinor)}.${partialInvoices?` Há ${partialInvoices} fatura${partialInvoices===1?'':'s'} ainda em revisão, então esse valor pode mudar.`:''} Isso é uma simulação, não uma recomendação de gasto.`,
      answerMinor:afterSpendMinor,
      sources:[...accountSources,...commitmentSources,...invoiceSources].slice(0,40),
      cards:[
        {label:'Disponível agora',amountMinor:availableMinor,detail:`${accountSources.length} conta${accountSources.length===1?'':'s'} conhecida${accountSources.length===1?'':'s'}`},
        {label:'Obrigações conhecidas',amountMinor:obligationsMinor,detail:`${commitmentSources.length+invoiceSources.length} item${commitmentSources.length+invoiceSources.length===1?'':'s'} aberto${commitmentSources.length+invoiceSources.length===1?'':'s'}`},
        {label:'Gasto simulado',amountMinor:spendMinor,detail:'Valor informado por você'},
        {label:'Restaria na projeção',amountMinor:afterSpendMinor,detail:afterSpendMinor>=0?'Após obrigações conhecidas e o gasto simulado':'Ficaria abaixo de zero com os dados conhecidos'}
      ],
      suggestions:['Quanto ainda falta pagar?','Quais parcelas terminam logo?','O que já está comprometido nos próximos meses?']
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
        title:'Nenhuma parcela ativa conhecida.',
        summary:'Não encontrei planos de parcelamento reconciliados ainda.',
        answerMinor:0,
        sources:[],
        cards:[],
        suggestions:['O que já está comprometido nos próximos meses?','Quanto ainda falta pagar?','Dá para gastar R$ 500?']
      };
    }

    const endingSoon=active.filter(plan=>plan.remaining<=3);
    const visible=active.slice(0,8);
    const releasedSoonMinor=endingSoon.reduce((sum,plan)=>sum+positive(plan.amountMinor),0);

    return {
      intent,
      title:endingSoon.length?'Estas parcelas terminam primeiro.':'Estas são as parcelas mais próximas do fim.',
      summary:endingSoon.length
        ? `${endingSoon.length} plano${endingSoon.length===1?' termina':'s terminam'} em até 3 parcelas. Quando acabarem, ${formatMoneyMinor(releasedSoonMinor)} por mês deixam de estar comprometidos, considerando os valores atuais.`
        : 'Nenhum plano termina nas próximas 3 parcelas, mas estes são os mais próximos do fim.',
      answerMinor:endingSoon.length?releasedSoonMinor:null,
      sources:visible.map(plan=>({
        kind:'installment_plan' as const,
        id:plan.id,
        label:plan.description||'Compra parcelada',
        amountMinor:positive(plan.amountMinor),
        detail:`${plan.remaining===1?'Falta':'Faltam'} ${plan.remaining} parcela${plan.remaining===1?'':'s'} de ${plan.totalInstallments}`
      })),
      cards:visible.slice(0,6).map(plan=>({
        label:plan.description||'Compra parcelada',
        amountMinor:positive(plan.amountMinor),
        detail:`${plan.remaining===1?'Falta':'Faltam'} ${plan.remaining} parcela${plan.remaining===1?'':'s'}`
      })),
      suggestions:['Dá para gastar R$ 500?','O que já está comprometido nos próximos meses?','Quanto ainda falta pagar?']
    };
  }

  if(intent==='spending_change'){
    const comparison=deriveSpendingComparison(input.transactions,input.now);
    const moneyNow=formatMoneyMinor(comparison.currentMinor);
    const moneyPrevious=formatMoneyMinor(comparison.previousMinor);
    if(!comparison.hasComparableData){
      return {
        intent,
        title:'Ainda falta um mês anterior para comparar.',
        summary:'Eu consigo explicar a diferença quando houver gastos registrados no mês atual e no mês anterior. Não vou inventar uma comparação sem base.',
        answerMinor:null,
        sources:[],
        cards:[
          {label:'Este mês',amountMinor:comparison.currentMinor,detail:`${comparison.currentCount} gasto${comparison.currentCount===1?'':'s'} conhecido${comparison.currentCount===1?'':'s'}`}
        ],
        suggestions:['O que está estranho?','Quanto ainda falta pagar?','Dá para gastar R$ 500?']
      };
    }

    const increased=comparison.deltaMinor>0;
    const top=comparison.topIncreases.slice(0,3);
    const reason=top.length
      ? ` As maiores altas vieram de ${top.map(item=>categoryLabel(item.category)).join(', ')}.`
      : '';
    const currentSources=input.transactions
      .filter(item=>item.direction==='expense'&&item.status!=='cancelled'&&item.source!=='credit_card_invoice_payment'&&String(item.observedOn||'').startsWith(comparison.currentMonthKey))
      .sort((a,b)=>b.amountMinor-a.amountMinor)
      .slice(0,20)
      .map(item=>({
        kind:'transaction' as const,
        id:item.id,
        label:item.description,
        amountMinor:item.amountMinor,
        detail:'Gasto observado neste mês'
      }));

    return {
      intent,
      title:increased
        ? `Você gastou ${formatMoneyMinor(comparison.deltaMinor)} a mais que no mês anterior.`
        : comparison.deltaMinor<0
          ? `Você gastou ${formatMoneyMinor(Math.abs(comparison.deltaMinor))} a menos que no mês anterior.`
          : 'Seus gastos conhecidos estão no mesmo nível do mês anterior.',
      summary:`Este mês tem ${moneyNow} em gastos conhecidos; o mês anterior teve ${moneyPrevious}.${reason} A comparação ignora transferências entre suas contas e pagamento de fatura para não contar a mesma despesa duas vezes.`,
      answerMinor:comparison.deltaMinor,
      sources:currentSources,
      cards:[
        {label:'Este mês',amountMinor:comparison.currentMinor,detail:`${comparison.currentCount} gasto${comparison.currentCount===1?'':'s'} conhecido${comparison.currentCount===1?'':'s'}`},
        {label:'Mês anterior',amountMinor:comparison.previousMinor,detail:`${comparison.previousCount} gasto${comparison.previousCount===1?'':'s'} conhecido${comparison.previousCount===1?'':'s'}`},
        ...top.map(item=>({
          label:categoryLabel(item.category),
          amountMinor:item.deltaMinor,
          detail:`Alta na categoria: ${formatMoneyMinor(item.previousMinor)} → ${formatMoneyMinor(item.currentMinor)}`
        }))
      ],
      suggestions:['O que está estranho?','Quanto ainda falta pagar?','Quais parcelas terminam logo?']
    };
  }

  if(intent==='anomalies'){
    const anomalies=deriveFinancialAnomalies(input.transactions,input.now);
    if(!anomalies.length){
      return {
        intent,
        title:'Nada fora do padrão conhecido chamou atenção.',
        summary:'Não encontrei duplicidades prováveis nem valores claramente acima do histórico disponível neste mês. Isso não garante que esteja tudo certo; significa apenas que não apareceu um sinal forte nos dados conhecidos.',
        answerMinor:null,
        sources:[],
        cards:[],
        suggestions:['Por que gastei mais este mês?','Quanto ainda falta pagar?','O que já está comprometido nos próximos meses?']
      };
    }

    return {
      intent,
      title:`Encontrei ${anomalies.length} ${anomalies.length===1?'item':'itens'} que vale conferir.`,
      summary:'São sinais, não acusações de erro. Eu marco apenas possíveis duplicidades e valores bem acima do histórico da mesma descrição.',
      answerMinor:null,
      sources:anomalies.map(item=>({
        kind:'transaction' as const,
        id:item.transactionId,
        label:item.description,
        amountMinor:item.amountMinor,
        detail:item.detail
      })),
      cards:anomalies.slice(0,6).map(item=>({
        label:item.type==='possible_duplicate'?'Possível duplicidade':'Valor diferente do normal',
        amountMinor:item.amountMinor,
        detail:item.baselineMinor
          ? `Histórico típico: ${formatMoneyMinor(item.baselineMinor)} · diferença de ${formatMoneyMinor(item.differenceMinor||0)}`
          : item.detail
      })),
      suggestions:['Por que gastei mais este mês?','Quanto ainda falta pagar?','Quais parcelas terminam logo?']
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
        detail:'Compromisso pendente'
      }));

    const invoiceSources=input.invoices
      .filter(item=>item.paymentStatus!=='paid'&&item.status!=='cancelled')
      .map(item=>{
        const open=Math.max(0,positive(item.confirmedAmountMinor)-positive(item.paidAmountMinor));
        return {
          kind:'invoice' as const,
          id:item.id,
          label:`Fatura ${item.invoiceKey}`,
          amountMinor:open,
          detail:item.status==='partial'
            ? 'Valor confirmado até agora; a fatura ainda está em revisão'
            : 'Fatura confirmada e ainda não paga'
        };
      })
      .filter(item=>item.amountMinor>0);

    const sources=[...commitmentSources,...invoiceSources];
    const total=sources.reduce((sum,item)=>sum+item.amountMinor,0);
    const partialInvoices=invoiceSources.filter(source=>
      input.invoices.find(invoice=>invoice.id===source.id)?.status==='partial'
    ).length;

    return {
      intent,
      title:total>0?'Ainda há valores conhecidos para pagar.':'Nada pendente conhecido agora.',
      summary:total>0
        ? `O NestBalance encontrou ${sources.length} obrigação${sources.length===1?'':'ões'} aberta${sources.length===1?'':'s'} nesta visão.${partialInvoices?` ${partialInvoices} fatura${partialInvoices===1?' está':'s estão'} em revisão, então o total pode aumentar.`:''}`
        : 'Não há compromissos nem faturas abertas confirmadas nos dados atuais.',
      answerMinor:total,
      sources:sources.sort((a,b)=>b.amountMinor-a.amountMinor).slice(0,30),
      cards:[
        {
          label:'Compromissos',
          amountMinor:commitmentSources.reduce((sum,item)=>sum+item.amountMinor,0),
          detail:`${commitmentSources.length} item${commitmentSources.length===1?'':'s'} pendente${commitmentSources.length===1?'':'s'}`
        },
        {
          label:'Faturas abertas',
          amountMinor:invoiceSources.reduce((sum,item)=>sum+item.amountMinor,0),
          detail:`${invoiceSources.length} fatura${invoiceSources.length===1?'':'s'} com valor conhecido`
        }
      ],
      suggestions:['Quanto tenho disponível?','O que já está comprometido nos próximos meses?']
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
        detail:'Saldo atual informado nesta conta'
      }));
    const total=sources.reduce((sum,item)=>sum+item.amountMinor,0);

    return {
      intent,
      title:'Saldo disponível conhecido',
      summary:sources.length
        ? `Somando ${sources.length} conta${sources.length===1?'':'s'} ativa${sources.length===1?'':'s'} nesta visão.`
        : 'Ainda não há uma conta com saldo disponível para somar.',
      answerMinor:total,
      sources,
      cards:sources.slice(0,6).map(item=>({label:item.label,amountMinor:item.amountMinor,detail:item.detail})),
      suggestions:['Quanto ainda falta pagar?','O que já está comprometido nos próximos meses?']
    };
  }

  if(intent==='future_months'){
    const projection=projectHouseholdFuture(input.commitments,input.installmentPlans,input.now,3);
    const total=projection.reduce((sum,item)=>sum+item.totalMinor,0);
    const monthFmt=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'});
    return {
      intent,
      title:'Compromissos conhecidos dos próximos meses',
      summary:'A projeção usa apenas contas recorrentes confirmadas e planos de parcelas já reconciliados.',
      answerMinor:total,
      sources:[
        ...input.commitments
          .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&item.recurring===true&&item.recurrence==='monthly')
          .map(item=>({
            kind:'commitment' as const,
            id:item.id,
            label:item.description,
            amountMinor:positive(item.amountMinor),
            detail:'Conta recorrente mensal'
          })),
        ...input.installmentPlans
          .filter(plan=>plan.status!=='completed'&&plan.status!=='cancelled')
          .map(plan=>({
            kind:'installment_plan' as const,
            id:plan.id,
            label:plan.description||'Compra parcelada',
            amountMinor:positive(plan.amountMinor),
            detail:`Parcela ${plan.lastObservedInstallment} de ${plan.totalInstallments} observada`
          }))
      ].slice(0,30),
      cards:projection.map(month=>({
        label:monthFmt.format(new Date(month.year,month.monthIndex,1)),
        amountMinor:month.totalMinor,
        detail:`${month.itemCount} compromisso${month.itemCount===1?'':'s'} conhecido${month.itemCount===1?'':'s'}`
      })),
      suggestions:['Quanto ainda falta pagar?','Quanto tenho disponível?']
    };
  }

  return {
    intent:'unsupported',
    title:'Posso responder com os dados desta visão.',
    summary:'Pergunte sobre saldo disponível, quanto falta pagar, próximos meses, simulação de gasto, parcelas que terminam, por que os gastos mudaram ou o que parece fora do padrão.',
    answerMinor:null,
    sources:[],
    cards:[],
    suggestions:['Por que gastei mais este mês?','O que está estranho?','Dá para gastar R$ 500?','Quais parcelas terminam logo?','Quanto ainda falta pagar?','Quanto tenho disponível?','O que já está comprometido nos próximos meses?']
  };
}
