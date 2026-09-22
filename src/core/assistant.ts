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
        title:tr(locale,'Nenhuma parcela ativa conhecida.','No known active installments.','No hay cuotas activas conocidas.'),
        summary:tr(locale,'Não encontrei planos de parcelamento reconciliados ainda.','I have not found reconciled installment plans yet.','Todavía no encontré planes de cuotas conciliados.'),
        answerMinor:0,
        sources:[],
        cards:[],
        suggestions:[prompts.future,prompts.remaining,prompts.spend]
      };
    }

    const endingSoon=active.filter(plan=>plan.remaining<=3);
    const visible=active.slice(0,8);
    const releasedSoonMinor=endingSoon.reduce((sum,plan)=>sum+positive(plan.amountMinor),0);

    return {
      intent,
      title:endingSoon.length?tr(locale,'Estas parcelas terminam primeiro.','These installments end first.','Estas cuotas terminan primero.'):tr(locale,'Estas são as parcelas mais próximas do fim.','These are the installments closest to ending.','Estas son las cuotas más próximas a terminar.'),
      summary:endingSoon.length
        ? tr(
            locale,
            `${endingSoon.length} plano${endingSoon.length===1?' termina':'s terminam'} em até 3 parcelas. Quando acabarem, ${formatMoneyMinor(releasedSoonMinor,locale)} por mês deixam de estar comprometidos, considerando os valores atuais.`,
            `${endingSoon.length} plan${endingSoon.length===1?' ends':'s end'} within 3 installments. When they end, ${formatMoneyMinor(releasedSoonMinor,locale)} per month will no longer be committed at current amounts.`,
            `${endingSoon.length} plan${endingSoon.length===1?' termina':'es terminan'} en hasta 3 cuotas. Cuando terminen, ${formatMoneyMinor(releasedSoonMinor,locale)} al mes dejarán de estar comprometidos con los valores actuales.`
          )
        : tr(locale,'Nenhum plano termina nas próximas 3 parcelas, mas estes são os mais próximos do fim.','No plan ends within the next 3 installments, but these are the closest to ending.','Ningún plan termina en las próximas 3 cuotas, pero estos son los más próximos a finalizar.'),
      answerMinor:endingSoon.length?releasedSoonMinor:null,
      sources:visible.map(plan=>({
        kind:'installment_plan' as const,
        id:plan.id,
        label:plan.description||tr(locale,'Compra parcelada','Installment purchase','Compra en cuotas'),
        amountMinor:positive(plan.amountMinor),
        detail:tr(locale,`${plan.remaining===1?'Falta':'Faltam'} ${plan.remaining} parcela${plan.remaining===1?'':'s'} de ${plan.totalInstallments}`,`${plan.remaining} installment${plan.remaining===1?'':'s'} left of ${plan.totalInstallments}`,`Falta${plan.remaining===1?'':'n'} ${plan.remaining} cuota${plan.remaining===1?'':'s'} de ${plan.totalInstallments}`)
      })),
      cards:visible.slice(0,6).map(plan=>({
        label:plan.description||tr(locale,'Compra parcelada','Installment purchase','Compra en cuotas'),
        amountMinor:positive(plan.amountMinor),
        detail:tr(locale,`${plan.remaining===1?'Falta':'Faltam'} ${plan.remaining} parcela${plan.remaining===1?'':'s'}`,`${plan.remaining} installment${plan.remaining===1?'':'s'} left`,`Falta${plan.remaining===1?'':'n'} ${plan.remaining} cuota${plan.remaining===1?'':'s'}`)
      })),
      suggestions:[prompts.spend,prompts.future,prompts.remaining]
    };
  }

  if(intent==='spending_change'){
    const comparison=deriveSpendingComparison(input.transactions,input.now);
    const moneyNow=formatMoneyMinor(comparison.currentMinor,locale);
    const moneyPrevious=formatMoneyMinor(comparison.previousMinor,locale);
    if(!comparison.hasComparableData){
      return {
        intent,
        title:tr(locale,'Ainda falta um mês anterior para comparar.','I still need a previous month to compare.','Todavía falta un mes anterior para comparar.'),
        summary:tr(locale,'Eu consigo explicar a diferença quando houver gastos registrados no mês atual e no mês anterior. Não vou inventar uma comparação sem base.','I can explain the difference once there is spending recorded in both the current and previous month. I will not invent a comparison without data.','Puedo explicar la diferencia cuando haya gastos registrados en el mes actual y en el anterior. No voy a inventar una comparación sin datos.'),
        answerMinor:null,
        sources:[],
        cards:[
          {label:tr(locale,'Este mês','This month','Este mes'),amountMinor:comparison.currentMinor,detail:tr(locale,`${comparison.currentCount} gasto${comparison.currentCount===1?'':'s'} conhecido${comparison.currentCount===1?'':'s'}`,`${comparison.currentCount} known expense${comparison.currentCount===1?'':'s'}`,`${comparison.currentCount} gasto${comparison.currentCount===1?'':'s'} conocido${comparison.currentCount===1?'':'s'}`)}
        ],
        suggestions:[prompts.anomalies,prompts.remaining,prompts.spend]
      };
    }

    const increased=comparison.deltaMinor>0;
    const top=comparison.topIncreases.slice(0,3);
    const reason=top.length
      ? tr(
          locale,
          ` As maiores altas vieram de ${top.map(item=>categoryLabel(item.category,'pt-BR')).join(', ')}.`,
          ` The biggest increases came from ${top.map(item=>categoryLabel(item.category,'en')).join(', ')}.`,
          ` Los mayores aumentos vinieron de ${top.map(item=>categoryLabel(item.category,'es')).join(', ')}.`
        )
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
        detail:tr(locale,'Gasto observado neste mês','Expense observed this month','Gasto observado este mes')
      }));

    return {
      intent,
      title:increased
        ? tr(locale,`Você gastou ${formatMoneyMinor(comparison.deltaMinor,locale)} a mais que no mês anterior.`,`You spent ${formatMoneyMinor(comparison.deltaMinor,locale)} more than last month.`,`Gastaste ${formatMoneyMinor(comparison.deltaMinor,locale)} más que el mes anterior.`)
        : comparison.deltaMinor<0
          ? tr(locale,`Você gastou ${formatMoneyMinor(Math.abs(comparison.deltaMinor),locale)} a menos que no mês anterior.`,`You spent ${formatMoneyMinor(Math.abs(comparison.deltaMinor),locale)} less than last month.`,`Gastaste ${formatMoneyMinor(Math.abs(comparison.deltaMinor),locale)} menos que el mes anterior.`)
          : tr(locale,'Seus gastos conhecidos estão no mesmo nível do mês anterior.','Your known spending is at the same level as last month.','Tus gastos conocidos están al mismo nivel que el mes anterior.'),
      summary:tr(locale,`Este mês tem ${moneyNow} em gastos conhecidos; o mês anterior teve ${moneyPrevious}.${reason} A comparação ignora transferências entre suas contas e pagamento de fatura para não contar a mesma despesa duas vezes.`,`This month has ${moneyNow} in known spending; last month had ${moneyPrevious}.${reason} The comparison ignores transfers between your accounts and statement payments so the same expense is not counted twice.`,`Este mes tiene ${moneyNow} en gastos conocidos; el mes anterior tuvo ${moneyPrevious}.${reason} La comparación ignora transferencias entre tus cuentas y pagos de tarjeta para no contar el mismo gasto dos veces.`),
      answerMinor:comparison.deltaMinor,
      sources:currentSources,
      cards:[
        {label:tr(locale,'Este mês','This month','Este mes'),amountMinor:comparison.currentMinor,detail:tr(locale,`${comparison.currentCount} gasto${comparison.currentCount===1?'':'s'} conhecido${comparison.currentCount===1?'':'s'}`,`${comparison.currentCount} known expense${comparison.currentCount===1?'':'s'}`,`${comparison.currentCount} gasto${comparison.currentCount===1?'':'s'} conocido${comparison.currentCount===1?'':'s'}`)},
        {label:tr(locale,'Mês anterior','Previous month','Mes anterior'),amountMinor:comparison.previousMinor,detail:tr(locale,`${comparison.previousCount} gasto${comparison.previousCount===1?'':'s'} conhecido${comparison.previousCount===1?'':'s'}`,`${comparison.previousCount} known expense${comparison.previousCount===1?'':'s'}`,`${comparison.previousCount} gasto${comparison.previousCount===1?'':'s'} conocido${comparison.previousCount===1?'':'s'}`)},
        ...top.map(item=>({
          label:categoryLabel(item.category,locale),
          amountMinor:item.deltaMinor,
          detail:tr(locale,`Alta na categoria: ${formatMoneyMinor(item.previousMinor,locale)} → ${formatMoneyMinor(item.currentMinor,locale)}`,`Category increase: ${formatMoneyMinor(item.previousMinor,locale)} → ${formatMoneyMinor(item.currentMinor,locale)}`,`Aumento en la categoría: ${formatMoneyMinor(item.previousMinor,locale)} → ${formatMoneyMinor(item.currentMinor,locale)}`)
        }))
      ],
      suggestions:[prompts.anomalies,prompts.remaining,prompts.ending]
    };
  }

  if(intent==='anomalies'){
    const anomalies=deriveFinancialAnomalies(input.transactions,input.now);
    if(!anomalies.length){
      return {
        intent,
        title:tr(locale,'Nada fora do padrão conhecido chamou atenção.','Nothing outside the known pattern stood out.','Nada fuera del patrón conocido llamó la atención.'),
        summary:tr(
          locale,
          'Não encontrei duplicidades prováveis nem valores claramente acima do histórico disponível neste mês. Isso não garante que esteja tudo certo; significa apenas que não apareceu um sinal forte nos dados conhecidos.',
          'I did not find likely duplicates or values clearly above the available history this month. That does not guarantee everything is correct; it only means there was no strong signal in the known data.',
          'No encontré duplicados probables ni valores claramente por encima del historial disponible este mes. Eso no garantiza que todo esté correcto; solo significa que no apareció una señal fuerte en los datos conocidos.'
        ),
        answerMinor:null,
        sources:[],
        cards:[],
        suggestions:[prompts.change,prompts.remaining,prompts.future]
      };
    }

    const anomalyDetail=(item:(typeof anomalies)[number])=>{
      if(item.type==='possible_duplicate'){
        return tr(
          locale,
          'Mais de um lançamento igual apareceu no mesmo dia. Pode estar certo, mas vale conferir.',
          'More than one identical entry appeared on the same day. It may be correct, but it is worth checking.',
          'Apareció más de un movimiento igual el mismo día. Puede estar bien, pero conviene revisarlo.'
        );
      }
      return tr(
        locale,
        `Este valor ficou acima do histórico conhecido${item.baselineMinor?` de ${formatMoneyMinor(item.baselineMinor,locale)}`:''}.`,
        `This amount is above the known history${item.baselineMinor?` of ${formatMoneyMinor(item.baselineMinor,locale)}`:''}.`,
        `Este valor está por encima del historial conocido${item.baselineMinor?` de ${formatMoneyMinor(item.baselineMinor,locale)}`:''}.`
      );
    };

    return {
      intent,
      title:tr(
        locale,
        `Encontrei ${anomalies.length} ${anomalies.length===1?'item':'itens'} que vale conferir.`,
        `I found ${anomalies.length} item${anomalies.length===1?'':'s'} worth checking.`,
        `Encontré ${anomalies.length} elemento${anomalies.length===1?'':'s'} que conviene revisar.`
      ),
      summary:tr(
        locale,
        'São sinais, não acusações de erro. Eu marco apenas possíveis duplicidades e valores bem acima do histórico da mesma descrição.',
        'These are signals, not claims that something is wrong. I only flag possible duplicates and values well above the history for the same description.',
        'Son señales, no afirmaciones de error. Solo marco posibles duplicados y valores muy por encima del historial de la misma descripción.'
      ),
      answerMinor:null,
      sources:anomalies.map(item=>({
        kind:'transaction' as const,
        id:item.transactionId,
        label:item.description,
        amountMinor:item.amountMinor,
        detail:anomalyDetail(item)
      })),
      cards:anomalies.slice(0,6).map(item=>({
        label:item.type==='possible_duplicate'
          ? tr(locale,'Possível duplicidade','Possible duplicate','Posible duplicado')
          : tr(locale,'Valor diferente do normal','Amount outside the usual pattern','Valor fuera de lo habitual'),
        amountMinor:item.amountMinor,
        detail:item.baselineMinor
          ? tr(
              locale,
              `Histórico típico: ${formatMoneyMinor(item.baselineMinor,locale)} · diferença de ${formatMoneyMinor(item.differenceMinor||0,locale)}`,
              `Typical history: ${formatMoneyMinor(item.baselineMinor,locale)} · difference of ${formatMoneyMinor(item.differenceMinor||0,locale)}`,
              `Historial típico: ${formatMoneyMinor(item.baselineMinor,locale)} · diferencia de ${formatMoneyMinor(item.differenceMinor||0,locale)}`
            )
          : anomalyDetail(item)
      })),
      suggestions:[prompts.change,prompts.remaining,prompts.ending]
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
        detail:tr(locale,'Compromisso pendente','Pending commitment','Compromiso pendiente')
      }));

    const invoiceSources=input.invoices
      .filter(item=>item.paymentStatus!=='paid'&&item.status!=='cancelled')
      .map(item=>{
        const open=Math.max(0,positive(item.confirmedAmountMinor)-positive(item.paidAmountMinor));
        return {
          kind:'invoice' as const,
          id:item.id,
          label:tr(locale,`Fatura ${item.invoiceKey}`,`Statement ${item.invoiceKey}`,`Resumen ${item.invoiceKey}`),
          amountMinor:open,
          detail:item.status==='partial'
            ? tr(locale,'Valor confirmado até agora; a fatura ainda está em revisão','Confirmed amount so far; the statement is still under review','Valor confirmado hasta ahora; el resumen todavía está en revisión')
            : tr(locale,'Fatura confirmada e ainda não paga','Confirmed statement not paid yet','Resumen confirmado y todavía no pagado')
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
      title:total>0
        ? tr(locale,'Ainda há valores conhecidos para pagar.','There are still known amounts to pay.','Todavía hay valores conocidos por pagar.')
        : tr(locale,'Nada pendente conhecido agora.','No known pending amount right now.','No hay valores pendientes conocidos ahora.'),
      summary:total>0
        ? tr(
            locale,
            `O NestBalance encontrou ${sources.length} obrigação${sources.length===1?'':'ões'} aberta${sources.length===1?'':'s'} nesta visão.${partialInvoices?` ${partialInvoices} fatura${partialInvoices===1?' está':'s estão'} em revisão, então o total pode aumentar.`:''}`,
            `NestBalance found ${sources.length} open obligation${sources.length===1?'':'s'} in this view.${partialInvoices?` ${partialInvoices} statement${partialInvoices===1?' is':'s are'} under review, so the total may increase.`:''}`,
            `NestBalance encontró ${sources.length} obligación${sources.length===1?'':'es'} abierta${sources.length===1?'':'s'} en esta vista.${partialInvoices?` Hay ${partialInvoices} resumen${partialInvoices===1?'':'es'} en revisión, así que el total puede aumentar.`:''}`
          )
        : tr(locale,'Não há compromissos nem faturas abertas confirmadas nos dados atuais.','There are no confirmed open commitments or statements in the current data.','No hay compromisos ni resúmenes abiertos confirmados en los datos actuales.'),
      answerMinor:total,
      sources:sources.sort((a,b)=>b.amountMinor-a.amountMinor).slice(0,30),
      cards:[
        {
          label:tr(locale,'Compromissos','Commitments','Compromisos'),
          amountMinor:commitmentSources.reduce((sum,item)=>sum+item.amountMinor,0),
          detail:tr(
            locale,
            `${commitmentSources.length} item${commitmentSources.length===1?'':'s'} pendente${commitmentSources.length===1?'':'s'}`,
            `${commitmentSources.length} pending item${commitmentSources.length===1?'':'s'}`,
            `${commitmentSources.length} elemento${commitmentSources.length===1?'':'s'} pendiente${commitmentSources.length===1?'':'s'}`
          )
        },
        {
          label:tr(locale,'Faturas abertas','Open statements','Resúmenes abiertos'),
          amountMinor:invoiceSources.reduce((sum,item)=>sum+item.amountMinor,0),
          detail:tr(
            locale,
            `${invoiceSources.length} fatura${invoiceSources.length===1?'':'s'} com valor conhecido`,
            `${invoiceSources.length} statement${invoiceSources.length===1?'':'s'} with a known amount`,
            `${invoiceSources.length} resumen${invoiceSources.length===1?'':'es'} con valor conocido`
          )
        }
      ],
      suggestions:[prompts.available,prompts.future]
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
        detail:tr(locale,'Saldo atual informado nesta conta','Current balance known for this account','Saldo actual conocido en esta cuenta')
      }));
    const total=sources.reduce((sum,item)=>sum+item.amountMinor,0);

    return {
      intent,
      title:tr(locale,'Saldo disponível conhecido','Known available balance','Saldo disponible conocido'),
      summary:sources.length
        ? tr(
            locale,
            `Somando ${sources.length} conta${sources.length===1?'':'s'} ativa${sources.length===1?'':'s'} nesta visão.`,
            `Adding ${sources.length} active account${sources.length===1?'':'s'} in this view.`,
            `Sumando ${sources.length} cuenta${sources.length===1?'':'s'} activa${sources.length===1?'':'s'} en esta vista.`
          )
        : tr(locale,'Ainda não há uma conta com saldo disponível para somar.','There is no account with an available balance to add yet.','Todavía no hay una cuenta con saldo disponible para sumar.'),
      answerMinor:total,
      sources,
      cards:sources.slice(0,6).map(item=>({label:item.label,amountMinor:item.amountMinor,detail:item.detail})),
      suggestions:[prompts.remaining,prompts.future]
    };
  }

  if(intent==='future_months'){
    const projection=projectHouseholdFuture(input.commitments,input.installmentPlans,input.now,3);
    const total=projection.reduce((sum,item)=>sum+item.totalMinor,0);
    const monthFmt=new Intl.DateTimeFormat(localeForIntl(locale),{month:'long',year:'numeric'});
    return {
      intent,
      title:tr(locale,'Compromissos conhecidos dos próximos meses','Known commitments for the next months','Compromisos conocidos de los próximos meses'),
      summary:tr(locale,'A projeção usa apenas contas recorrentes confirmadas e planos de parcelas já reconciliados.','The forecast uses only confirmed recurring bills and already reconciled installment plans.','La previsión usa solo cuentas recurrentes confirmadas y planes de cuotas ya conciliados.'),
      answerMinor:total,
      sources:[
        ...input.commitments
          .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&item.recurring===true&&item.recurrence==='monthly')
          .map(item=>({
            kind:'commitment' as const,
            id:item.id,
            label:item.description,
            amountMinor:positive(item.amountMinor),
            detail:tr(locale,'Conta recorrente mensal','Monthly recurring bill','Cuenta recurrente mensual')
          })),
        ...input.installmentPlans
          .filter(plan=>plan.status!=='completed'&&plan.status!=='cancelled')
          .map(plan=>({
            kind:'installment_plan' as const,
            id:plan.id,
            label:plan.description||tr(locale,'Compra parcelada','Installment purchase','Compra en cuotas'),
            amountMinor:positive(plan.amountMinor),
            detail:tr(
              locale,
              `Parcela ${plan.lastObservedInstallment} de ${plan.totalInstallments} observada`,
              `Installment ${plan.lastObservedInstallment} of ${plan.totalInstallments} observed`,
              `Cuota ${plan.lastObservedInstallment} de ${plan.totalInstallments} observada`
            )
          }))
      ].slice(0,30),
      cards:projection.map(month=>({
        label:monthFmt.format(new Date(month.year,month.monthIndex,1)),
        amountMinor:month.totalMinor,
        detail:tr(
          locale,
          `${month.itemCount} compromisso${month.itemCount===1?'':'s'} conhecido${month.itemCount===1?'':'s'}`,
          `${month.itemCount} known commitment${month.itemCount===1?'':'s'}`,
          `${month.itemCount} compromiso${month.itemCount===1?'':'s'} conocido${month.itemCount===1?'':'s'}`
        )
      })),
      suggestions:[prompts.remaining,prompts.available]
    };
  }

  return {
    intent:'unsupported',
    title:tr(locale,'Posso responder com os dados desta visão.','I can answer using the data in this view.','Puedo responder con los datos de esta vista.'),
    summary:tr(
      locale,
      'Pergunte sobre saldo disponível, quanto falta pagar, próximos meses, simulação de gasto, parcelas que terminam, por que os gastos mudaram ou o que parece fora do padrão.',
      'Ask about available balance, what is still left to pay, the next months, a spending simulation, installments that end soon, why spending changed, or what looks unusual.',
      'Pregunta por el saldo disponible, cuánto falta pagar, los próximos meses, una simulación de gasto, cuotas que terminan pronto, por qué cambiaron los gastos o qué parece fuera de lo normal.'
    ),
    answerMinor:null,
    sources:[],
    cards:[],
    suggestions:[prompts.change,prompts.anomalies,prompts.spend,prompts.ending,prompts.remaining,prompts.available,prompts.future]
  };
}
