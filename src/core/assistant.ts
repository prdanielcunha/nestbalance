import { projectHouseholdFuture, type ProjectionCommitment, type ProjectionInstallmentPlan } from './future-projection.js';
import { categoryLabel, deriveFinancialAnomalies, deriveSpendingComparison, type InsightTransaction } from './insights.js';
import { localeForIntl, type AppLocale } from './locale.js';

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

function tr(locale:AppLocale,pt:string,en:string,es:string){
  return locale==='en'?en:locale==='es'?es:pt;
}

function assistantPrompts(locale:AppLocale){
  return {
    spend:tr(locale,'Dá para gastar R$ 500?','Can I spend R$ 500?','¿Puedo gastar R$ 500?'),
    ending:tr(locale,'Quais parcelas terminam logo?','Which installments end soon?','¿Qué cuotas terminan pronto?'),
    remaining:tr(locale,'Quanto ainda falta pagar?','How much is still left to pay?','¿Cuánto falta pagar?'),
    available:tr(locale,'Quanto tenho disponível?','How much do I have available?','¿Cuánto tengo disponible?'),
    future:tr(locale,'O que já está comprometido nos próximos meses?','What is already committed in the next months?','¿Qué ya está comprometido en los próximos meses?'),
    change:tr(locale,'Por que gastei mais este mês?','Why did I spend more this month?','¿Por qué gasté más este mes?'),
    anomalies:tr(locale,'O que está estranho?','What looks unusual?','¿Qué se ve extraño?')
  };
}

function formatMoneyMinor(value:number,locale:AppLocale){
  return new Intl.NumberFormat(localeForIntl(locale),{style:'currency',currency:'BRL'}).format(value/100);
}

function parseRequestedMoneyMinor(question:string){
  const normalized=question.normalize('NFKC').replace(/\s+/g,' ').trim();
  const currencyMatch=normalized.match(/(?:R\$|BRL)\s*([0-9.,]+)/i);
  const wordsMatch=normalized.match(/([0-9.,]+)\s*(?:reais?|brl)/i);
  const spendMatch=normalized.match(/(?:gastar|gasto|gastasse|spend|spent|gastar|gasto)\s*(?:de\s*)?([0-9.,]+)/i);
  const raw=(currencyMatch?.[1]||wordsMatch?.[1]||spendMatch?.[1]||'').trim();
  if(!raw) return null;
  const lastComma=raw.lastIndexOf(',');
  const lastDot=raw.lastIndexOf('.');
  let numeric=raw;
  if(lastComma>=0&&lastDot>=0){
    numeric=lastComma>lastDot?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
  }else if(lastComma>=0){
    numeric=/,\d{1,2}$/.test(raw)?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
  }else if((raw.match(/\./g)||[]).length>1){
    numeric=raw.replace(/\./g,'');
  }
  const number=Number(numeric);
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
    /se eu gastar/.test(q)||
    /can i spend/.test(q)||
    /if i spend/.test(q)||
    /could i spend/.test(q)||
    /puedo gastar/.test(q)||
    /si gasto/.test(q)
  ) return 'spending_simulation';

  if(
    /por que.*gastei.*mais/.test(q)||
    /porque.*gastei.*mais/.test(q)||
    /gastei.*mais.*(?:mes|mês)/.test(q)||
    /aumentou.*(?:gasto|despesa)/.test(q)||
    /why.*(?:spend|spent).*more/.test(q)||
    /spending.*(?:increase|higher)/.test(q)||
    /por que.*gaste.*mas/.test(q)||
    /porque.*gaste.*mas/.test(q)||
    /aument.*(?:gasto|gastos)/.test(q)
  ) return 'spending_change';

  if(
    /o que.*estranh/.test(q)||
    /algo.*estranh/.test(q)||
    /cobranca.*(?:diferente|fora)/.test(q)||
    /cobrança.*(?:diferente|fora)/.test(q)||
    /duplicad/.test(q)||
    /what.*(?:unusual|strange)/.test(q)||
    /anything.*(?:unusual|strange)/.test(q)||
    /duplicate/.test(q)||
    /out of pattern/.test(q)||
    /que.*(?:raro|extrano)/.test(q)||
    /algo.*(?:raro|extrano)/.test(q)||
    /fuera.*(?:normal|patron)/.test(q)
  ) return 'anomalies';

  if(
    /parcelas?.*(?:terminam|acabam|finalizam)/.test(q)||
    /parcelamentos?.*(?:terminam|acabam|finalizam)/.test(q)||
    /quais .*parcelas?.*logo/.test(q)||
    /installments?.*(?:end|finish)/.test(q)||
    /which .*installments?.*soon/.test(q)||
    /cuotas?.*(?:terminan|acaban)/.test(q)||
    /que .*cuotas?.*pronto/.test(q)
  ) return 'ending_installments';

  if(
    /quanto .*falta.*pagar/.test(q)||
    /falta.*pagar/.test(q)||
    /ainda.*pagar/.test(q)||
    /contas?.*pendentes?/.test(q)||
    /quanto.*pendente/.test(q)||
    /ainda.*vai.*sair/.test(q)||
    /how much.*(?:left|still).*(?:pay|payment)/.test(q)||
    /still.*(?:need|have).*pay/.test(q)||
    /pending bills?/.test(q)||
    /cuanto.*falta.*pagar/.test(q)||
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
    /dinero.*disponible/.test(q)
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
    /mes que viene/.test(q)||
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
  locale?:AppLocale;
}):AssistantAnswer{
  const locale=input.locale||'pt-BR';
  const prompts=assistantPrompts(locale);
  const intent=classifyAssistantIntent(input.question);

  if(intent==='spending_simulation'){
    const spendMinor=parseRequestedMoneyMinor(input.question);
    if(!spendMinor){
      return {
        intent,
        title:tr(locale,'Qual valor você quer simular?','What amount do you want to simulate?','¿Qué valor quieres simular?'),
        summary:tr(locale,'Escreva o valor na própria pergunta, por exemplo: “Dá para gastar R$ 500?”.','Include the amount in your question, for example: “Can I spend R$ 500?”.','Incluye el valor en la pregunta, por ejemplo: “¿Puedo gastar R$ 500?”.'),
        answerMinor:null,
        sources:[],
        cards:[],
        suggestions:[prompts.spend,prompts.remaining,prompts.available]
      };
    }

    const accountSources=input.accounts
      .filter(account=>account.status!=='inactive')
      .map(account=>({
        kind:'account' as const,
        id:account.id,
        label:account.name,
        amountMinor:Number(account.balanceMinor)||0,
        detail:tr(locale,'Saldo atual conhecido','Known current balance','Saldo actual conocido')
      }));
    const commitmentSources=input.commitments
      .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&positive(item.amountMinor)>0)
      .map(item=>({
        kind:'commitment' as const,
        id:item.id,
        label:item.description,
        amountMinor:positive(item.amountMinor),
        detail:tr(locale,'Compromisso aberto conhecido','Known open commitment','Compromiso abierto conocido')
      }));
    const invoiceSources=input.invoices
      .filter(item=>item.paymentStatus!=='paid'&&item.status!=='cancelled')
      .map(item=>({
        kind:'invoice' as const,
        id:item.id,
        label:tr(locale,`Fatura ${item.invoiceKey}`,`Statement ${item.invoiceKey}`,`Resumen ${item.invoiceKey}`),
        amountMinor:Math.max(0,positive(item.confirmedAmountMinor)-positive(item.paidAmountMinor)),
        detail:item.status==='partial'?tr(locale,'Fatura ainda em revisão','Statement still under review','Resumen todavía en revisión'):tr(locale,'Fatura aberta confirmada','Confirmed open statement','Resumen abierto confirmado')
      }))
      .filter(item=>item.amountMinor>0);

    const availableMinor=accountSources.reduce((sum,item)=>sum+item.amountMinor,0);
    const obligationsMinor=[...commitmentSources,...invoiceSources].reduce((sum,item)=>sum+item.amountMinor,0);
    const afterSpendMinor=availableMinor-obligationsMinor-spendMinor;
    const partialInvoices=input.invoices.filter(item=>item.status==='partial'&&item.paymentStatus!=='paid').length;

    return {
      intent,
      title:tr(locale,`Simulação de ${formatMoneyMinor(spendMinor,locale)}`,`Simulation of ${formatMoneyMinor(spendMinor,locale)}`,`Simulación de ${formatMoneyMinor(spendMinor,locale)}`),
      summary:tr(
        locale,
        `Com os saldos e obrigações conhecidos agora, depois desse gasto a projeção ficaria em ${formatMoneyMinor(afterSpendMinor,locale)}.${partialInvoices?` Há ${partialInvoices} fatura${partialInvoices===1?'':'s'} ainda em revisão, então esse valor pode mudar.`:''} Isso é uma simulação, não uma recomendação de gasto.`,
        `With the balances and obligations known right now, after this expense the projection would be ${formatMoneyMinor(afterSpendMinor,locale)}.${partialInvoices?` ${partialInvoices} statement${partialInvoices===1?' is':'s are'} still under review, so this amount may change.`:''} This is a simulation, not a spending recommendation.`,
        `Con los saldos y obligaciones conocidos ahora, después de este gasto la proyección quedaría en ${formatMoneyMinor(afterSpendMinor,locale)}.${partialInvoices?` Hay ${partialInvoices} resumen${partialInvoices===1?'':'es'} todavía en revisión, así que este valor puede cambiar.`:''} Es una simulación, no una recomendación de gasto.`
      ),
      answerMinor:afterSpendMinor,
      sources:[...accountSources,...commitmentSources,...invoiceSources].slice(0,40),
      cards:[
        {label:tr(locale,'Disponível agora','Available now','Disponible ahora'),amountMinor:availableMinor,detail:tr(locale,`${accountSources.length} conta${accountSources.length===1?'':'s'} conhecida${accountSources.length===1?'':'s'}`,`${accountSources.length} known account${accountSources.length===1?'':'s'}`,`${accountSources.length} cuenta${accountSources.length===1?'':'s'} conocida${accountSources.length===1?'':'s'}`)},
        {label:tr(locale,'Obrigações conhecidas','Known obligations','Obligaciones conocidas'),amountMinor:obligationsMinor,detail:tr(locale,`${commitmentSources.length+invoiceSources.length} item${commitmentSources.length+invoiceSources.length===1?'':'s'} aberto${commitmentSources.length+invoiceSources.length===1?'':'s'}`,`${commitmentSources.length+invoiceSources.length} open item${commitmentSources.length+invoiceSources.length===1?'':'s'}`,`${commitmentSources.length+invoiceSources.length} elemento${commitmentSources.length+invoiceSources.length===1?'':'s'} abierto${commitmentSources.length+invoiceSources.length===1?'':'s'}`)},
        {label:tr(locale,'Gasto simulado','Simulated expense','Gasto simulado'),amountMinor:spendMinor,detail:tr(locale,'Valor informado por você','Amount you provided','Valor informado por ti')},
        {label:tr(locale,'Restaria na projeção','Projected remainder','Quedaría en la proyección'),amountMinor:afterSpendMinor,detail:afterSpendMinor>=0?tr(locale,'Após obrigações conhecidas e o gasto simulado','After known obligations and the simulated expense','Después de las obligaciones conocidas y el gasto simulado'):tr(locale,'Ficaria abaixo de zero com os dados conhecidos','Would fall below zero with the known data','Quedaría por debajo de cero con los datos conocidos')}
      ],
      suggestions:[prompts.remaining,prompts.ending,prompts.future]
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
