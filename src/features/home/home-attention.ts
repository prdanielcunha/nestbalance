import { categoryLabel, type FinancialAnomaly, type SpendingComparison } from '@/src/core/insights';
import type { AppLocale } from '@/src/core/locale';
import type { ProactivityPreferences } from '@/src/core/proactivity';
import type { HomeInstallmentPlan, HomeRow } from '@/src/lib/repositories/home';

export type HomeAttentionItem={
  key:string;
  code:string;
  kind:string;
  title:string;
  detail:string;
  reason:string;
  href:string;
  action:string;
  snoozeDays:number;
};

export function deriveHomeAttentionItems(input:{
  commitments:HomeRow[];
  installmentPlans:HomeInstallmentPlan[];
  anomalies:FinancialAnomaly[];
  spendingComparison:SpendingComparison;
  proactivity:ProactivityPreferences;
  locale:AppLocale;
  formatMoney:(minor:number)=>string;
  currentMonthKey:string;
  dismissedKeys:string[];
  now?:Date;
}):HomeAttentionItem[]{
  const {commitments,installmentPlans,anomalies,spendingComparison,proactivity,locale,formatMoney,currentMonthKey,dismissedKeys}=input;
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const today=(input.now||new Date()).getDate();
  const items:HomeAttentionItem[]=[];

  const overdue=commitments
    .filter(item=>!item.paidThisMonth&&item.status!=='paid'&&item.status!=='cancelled'&&Number.isInteger(item.dueDay)&&Number(item.dueDay)<today)
    .sort((a,b)=>Number(a.dueDay)-Number(b.dueDay))[0];
  const dueSoon=commitments
    .filter(item=>!item.paidThisMonth&&item.status!=='paid'&&item.status!=='cancelled'&&Number.isInteger(item.dueDay)&&Number(item.dueDay)>=today&&Number(item.dueDay)<=today+3)
    .sort((a,b)=>Number(a.dueDay)-Number(b.dueDay))[0];

  if(proactivity.dueBills&&overdue){
    items.push({
      key:'overdue-'+overdue.id,
      code:'overdue',
      kind:l('VENCEU','OVERDUE','VENCIDA'),
      title:l(`${overdue.description} ainda aparece como pendente.`,`${overdue.description} still appears unpaid.`,`${overdue.description} todavía aparece pendiente.`),
      detail:l(`${formatMoney(overdue.amountMinor)} · venceu dia ${overdue.dueDay}. Se você já pagou, marque como pago para a previsão ficar correta.`,`${formatMoney(overdue.amountMinor)} · due on day ${overdue.dueDay}. If you already paid it, mark it paid so the forecast stays accurate.`,`${formatMoney(overdue.amountMinor)} · venció el día ${overdue.dueDay}. Si ya pagaste, márcalo como pagado para mantener correcta la previsión.`),
      reason:l('Esta conta tem data conhecida, já passou do dia de vencimento deste mês e ainda não foi marcada como paga.','This bill has a known due day, that day has already passed this month, and it is not marked as paid.','Esta cuenta tiene una fecha conocida, el vencimiento de este mes ya pasó y todavía no está marcada como pagada.'),
      href:'#monthly-payments',
      action:l('Ver conta','View bill','Ver cuenta'),
      snoozeDays:1
    });
  }else if(proactivity.dueBills&&dueSoon){
    items.push({
      key:'due-'+dueSoon.id,
      code:Number(dueSoon.dueDay)===today?'due_today':'due_soon',
      kind:Number(dueSoon.dueDay)===today?l('VENCE HOJE','DUE TODAY','VENCE HOY'):l('PRÓXIMO PAGAMENTO','UPCOMING PAYMENT','PRÓXIMO PAGO'),
      title:l(`${dueSoon.description} ${Number(dueSoon.dueDay)===today?'vence hoje':`vence dia ${dueSoon.dueDay}`}.`,`${dueSoon.description} ${Number(dueSoon.dueDay)===today?'is due today':`is due on day ${dueSoon.dueDay}`}.`,`${dueSoon.description} ${Number(dueSoon.dueDay)===today?'vence hoy':`vence el día ${dueSoon.dueDay}`}.`),
      detail:l(`${formatMoney(dueSoon.amountMinor)} já está considerado no que ainda vai sair.`,`${formatMoney(dueSoon.amountMinor)} is already included in what is still expected to leave.`,`${formatMoney(dueSoon.amountMinor)} ya está incluido en lo que todavía saldrá.`),
      reason:l(`O vencimento conhecido é dia ${dueSoon.dueDay}, dentro dos próximos três dias, e a conta ainda aparece pendente.`,`The known due day is ${dueSoon.dueDay}, within the next three days, and the bill still appears unpaid.`,`El vencimiento conocido es el día ${dueSoon.dueDay}, dentro de los próximos tres días, y la cuenta todavía aparece pendiente.`),
      href:'#monthly-payments',
      action:l('Ver conta','View bill','Ver cuenta'),
      snoozeDays:1
    });
  }

  const anomaly=anomalies[0];
  if(proactivity.anomalies&&anomaly){
    items.push({
      key:'anomaly-'+anomaly.transactionId,
      code:'anomaly',
      kind:anomaly.type==='possible_duplicate'?l('VALE CONFERIR','WORTH CHECKING','CONVIENE REVISAR'):l('FORA DO PADRÃO','OUT OF PATTERN','FUERA DEL PATRÓN'),
      title:anomaly.type==='possible_duplicate'
        ? l(`${anomaly.description} apareceu mais de uma vez no mesmo dia.`,`${anomaly.description} appeared more than once on the same day.`,`${anomaly.description} apareció más de una vez el mismo día.`)
        : l(`${anomaly.description} veio acima do histórico conhecido.`,`${anomaly.description} is above its known history.`,`${anomaly.description} está por encima de su historial conocido.`),
      detail:anomaly.type==='possible_duplicate'
        ? l('Pode estar certo. O NestBalance só está sinalizando para você não pagar ou contar duas vezes sem querer.','It may be correct. NestBalance is only flagging it so you do not pay or count it twice by mistake.','Puede estar bien. NestBalance solo lo señala para evitar pagar o contar dos veces por error.')
        : l(`${formatMoney(anomaly.amountMinor)} agora · histórico típico de ${formatMoney(anomaly.baselineMinor||0)}.`,`${formatMoney(anomaly.amountMinor)} now · typical history ${formatMoney(anomaly.baselineMinor||0)}.`,`${formatMoney(anomaly.amountMinor)} ahora · historial típico ${formatMoney(anomaly.baselineMinor||0)}.`),
      reason:anomaly.type==='possible_duplicate'
        ? l('Dois ou mais lançamentos com a mesma descrição, valor e dia apareceram nos dados conhecidos.','Two or more known entries share the same description, amount and day.','Dos o más movimientos conocidos tienen la misma descripción, importe y día.')
        : l(`O valor atual ficou pelo menos 35% e ${formatMoney(anomaly.differenceMinor||0)} acima da mediana do histórico dessa descrição.`,`The current amount is at least 35% and ${formatMoney(anomaly.differenceMinor||0)} above the median history for this description.`,`El valor actual quedó al menos 35% y ${formatMoney(anomaly.differenceMinor||0)} por encima de la mediana histórica de esta descripción.`),
      href:'/assistant',
      action:l('Entender','Understand','Entender'),
      snoozeDays:7
    });
  }

  if(proactivity.spendingChanges&&spendingComparison.hasComparableData&&spendingComparison.deltaMinor>0){
    const top=spendingComparison.topIncreases[0];
    items.push({
      key:'spending-change-'+currentMonthKey,
      code:'spending_change',
      kind:l('SEU MÊS MUDOU','YOUR MONTH CHANGED','TU MES CAMBIÓ'),
      title:l(`Os gastos conhecidos estão ${formatMoney(spendingComparison.deltaMinor)} acima do mês anterior.`,`Known spending is ${formatMoney(spendingComparison.deltaMinor)} above last month.`,`Los gastos conocidos están ${formatMoney(spendingComparison.deltaMinor)} por encima del mes anterior.`),
      detail:top
        ? l(`${categoryLabel(top.category,'pt-BR')} foi a maior alta até agora, com ${formatMoney(top.deltaMinor)} a mais.`,`${categoryLabel(top.category,'en')} had the biggest increase so far, up ${formatMoney(top.deltaMinor)}.`,`${categoryLabel(top.category,'es')} fue el mayor aumento hasta ahora, con ${formatMoney(top.deltaMinor)} más.`)
        : l('A comparação usa somente gastos conhecidos e evita contar transferências e pagamento de fatura como nova despesa.','The comparison uses only known spending and excludes transfers and statement payments so expenses are not counted twice.','La comparación usa solo gastos conocidos y excluye transferencias y pagos de tarjeta para no contar el gasto dos veces.'),
      reason:l('A comparação soma apenas gastos conhecidos do mês atual e do anterior, excluindo transferências entre suas contas e pagamento de fatura para evitar dupla contagem.','The comparison adds only known spending from this month and the previous one, excluding transfers between your accounts and statement payments to avoid double counting.','La comparación suma solo gastos conocidos de este mes y del anterior, excluyendo transferencias entre tus cuentas y pagos de tarjeta para evitar doble conteo.'),
      href:'/assistant',
      action:l('Ver por quê','See why','Ver por qué'),
      snoozeDays:7
    });
  }

  const ending=installmentPlans
    .map(plan=>({...plan,remaining:Math.max(0,plan.totalInstallments-plan.lastObservedInstallment)}))
    .filter(plan=>plan.remaining===1&&plan.amountMinor>0)
    .sort((a,b)=>b.amountMinor-a.amountMinor)[0];
  if(proactivity.installmentEnds&&ending){
    items.push({
      key:'ending-'+ending.id,
      code:'installment_ending',
      kind:l('TERMINA LOGO','ENDING SOON','TERMINA PRONTO'),
      title:l(`${ending.description} está na última parcela conhecida.`,`${ending.description} is on its last known installment.`,`${ending.description} está en su última cuota conocida.`),
      detail:l(`Depois dela, ${formatMoney(ending.amountMinor)} por mês deixam de estar comprometidos nessa projeção.`,`After it ends, ${formatMoney(ending.amountMinor)} per month is no longer committed in this forecast.`,`Después, ${formatMoney(ending.amountMinor)} al mes dejan de estar comprometidos en esta previsión.`),
      reason:l('O plano reconciliado mostra apenas uma parcela restante com o valor atual conhecido.','The reconciled installment plan shows only one remaining installment at the current known amount.','El plan de cuotas conciliado muestra solo una cuota restante con el valor actual conocido.'),
      href:'/assistant',
      action:l('Ver parcelas','View installments','Ver cuotas'),
      snoozeDays:30
    });
  }

  return items.filter(item=>!dismissedKeys.includes(item.key)).slice(0,3);
}

export function deriveHomeMonthNarrative(input:{
  accountCount:number;
  futureCommitmentsMinor:number;
  projectedRemainderMinor:number;
  spendingComparison:SpendingComparison;
  partialInvoiceCount:number;
  hasData:boolean;
  locale:AppLocale;
  formatMoney:(minor:number)=>string;
}){
  const {accountCount,futureCommitmentsMinor,projectedRemainderMinor,spendingComparison,partialInvoiceCount,hasData,locale,formatMoney}=input;
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const items:string[]=[];
  if(accountCount){
    if(futureCommitmentsMinor>0){
      items.push(l(
        `${formatMoney(futureCommitmentsMinor)} ainda estão comprometidos; com o que já sabemos, devem sobrar ${formatMoney(projectedRemainderMinor)}.`,
        `${formatMoney(futureCommitmentsMinor)} is still committed; from what we know, about ${formatMoney(projectedRemainderMinor)} should remain.`,
        `${formatMoney(futureCommitmentsMinor)} todavía está comprometido; con lo que sabemos, deberían quedar ${formatMoney(projectedRemainderMinor)}.`
      ));
    }else{
      items.push(l(
        'Não há contas pendentes conhecidas nesta visão.',
        'There are no known pending bills in this view.',
        'No hay cuentas pendientes conocidas en esta vista.'
      ));
    }
  }
  if(spendingComparison.hasComparableData&&spendingComparison.deltaMinor!==0){
    items.push(spendingComparison.deltaMinor>0
      ? l(
          `Os gastos conhecidos estão ${formatMoney(spendingComparison.deltaMinor)} acima do mês anterior.`,
          `Known spending is ${formatMoney(spendingComparison.deltaMinor)} above last month.`,
          `Los gastos conocidos están ${formatMoney(spendingComparison.deltaMinor)} por encima del mes anterior.`
        )
      : l(
          `Os gastos conhecidos estão ${formatMoney(Math.abs(spendingComparison.deltaMinor))} abaixo do mês anterior.`,
          `Known spending is ${formatMoney(Math.abs(spendingComparison.deltaMinor))} below last month.`,
          `Los gastos conocidos están ${formatMoney(Math.abs(spendingComparison.deltaMinor))} por debajo del mes anterior.`
        ));
  }
  if(partialInvoiceCount>0){
    items.push(l(
      `${partialInvoiceCount} fatura${partialInvoiceCount===1?' ainda pode':'s ainda podem'} mudar a projeção. O valor mostrado é um teto com os dados confirmados até agora.`,
      `${partialInvoiceCount} statement${partialInvoiceCount===1?' may':'s may'} still change the forecast. The amount shown is an upper estimate based on confirmed data so far.`,
      `${partialInvoiceCount} resumen${partialInvoiceCount===1?' todavía puede':'es todavía pueden'} cambiar la previsión. El valor mostrado es un máximo estimado con los datos confirmados hasta ahora.`
    ));
  }
  if(!items.length&&hasData){
    items.push(l(
      'Nada importante mudou nos dados conhecidos deste mês.',
      'Nothing important changed in the known data for this month.',
      'Nada importante cambió en los datos conocidos de este mes.'
    ));
  }
  return items.slice(0,3);
}
