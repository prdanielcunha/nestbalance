'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { deriveHomeSnapshot } from '@/src/core/summary';
import { deriveCashView } from '@/src/core/cash-view';
import { projectHouseholdFuture } from '@/src/core/future-projection';
import { categoryLabel, deriveFinancialAnomalies, deriveSpendingComparison } from '@/src/core/insights';
import { AccountOnboarding } from '@/src/features/onboarding/account-onboarding';
import { CreditCardManager } from '@/src/features/cards/card-manager';
import { MonthlyPayments } from '@/src/features/payments/monthly-payments';
import { useI18n } from '@/src/i18n/locale-provider';
import { useHouseholdRevisionRefresh } from '@/src/features/realtime/use-household-revision';
import { canHouseholdRole, type HouseholdRole } from '@/src/core/household';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { AppShell } from '@/src/features/navigation/app-shell';
import { loadHomeData, type HomeAccount, type HomeCreditCard, type HomeInstallmentPlan, type HomeInvoiceImport, type HomeRow } from '@/src/lib/repositories/home';
import { DEFAULT_PROACTIVITY_PREFERENCES, type ProactivityPreferences } from '@/src/core/proactivity';
import { dismissAttention } from '@/src/lib/repositories/attention';
import { isDismissibleAttentionKind } from '@/src/core/attention';
import { reportProductEvent } from '@/src/lib/product-events';


export function HomeScreen({ householdId, role, firstValueStartedAtMs }: { householdId: string; role: HouseholdRole; firstValueStartedAtMs?:number }) {
  const {t,locale,intlLocale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const monthName=useMemo(()=>new Intl.DateTimeFormat(intlLocale,{month:'long'}),[intlLocale]);
  const canManage = canHouseholdRole(role,'manage_finance');
  const canContribute = role !== 'read_only';
  const [transactions, setTransactions] = useState<HomeRow[]>([]);
  const [commitments, setCommitments] = useState<HomeRow[]>([]);
  const [accounts, setAccounts] = useState<HomeAccount[]>([]);
  const [cards, setCards] = useState<HomeCreditCard[]>([]);
  const [installmentPlans,setInstallmentPlans]=useState<HomeInstallmentPlan[]>([]);
  const [invoiceImports,setInvoiceImports]=useState<HomeInvoiceImport[]>([]);
  const [loadingHome,setLoadingHome]=useState(true);
  const [homeError,setHomeError]=useState('');
  const [expandedFuture,setExpandedFuture]=useState<string|null>(null);
  const [accountCreated,setAccountCreated]=useState(0);
  const [cardCreated,setCardCreated]=useState(0);
  const [view,setView]=useState<FinancialView>('household');
  const [proactivity,setProactivity]=useState<ProactivityPreferences>(DEFAULT_PROACTIVITY_PREFERENCES);
  const [dismissedAttentionKeys,setDismissedAttentionKeys]=useState<string[]>([]);
  const [attentionWorking,setAttentionWorking]=useState('');
  const [attentionError,setAttentionError]=useState('');
  const firstValueReportedRef=useRef(false);

  async function refreshHome(silent=false){
    if(!silent) setLoadingHome(true);
    try{
      const data=await loadHomeData(householdId);
      setAccounts(data.accounts);
      setCards(data.cards||[]);
      setTransactions(data.transactions);
      setCommitments(data.commitments);
      setInstallmentPlans(data.installmentPlans||[]);
      setInvoiceImports(data.invoiceImports||[]);
      setProactivity(data.proactivityPreferences||DEFAULT_PROACTIVITY_PREFERENCES);
      setDismissedAttentionKeys(data.dismissedAttentionKeys||[]);
      setHomeError('');
    }catch{
      setHomeError(l('Não conseguimos atualizar sua visão financeira agora.','We could not refresh your financial view right now.','No pudimos actualizar tu visión financiera ahora.'));
    }finally{
      if(!silent) setLoadingHome(false);
    }
  }

  useHouseholdRevisionRefresh(householdId,()=>refreshHome(true),25_000,['home','movements','accounts','invoices','pots']);

  useEffect(() => {
    void refreshHome();
    const onFocus=()=>void refreshHome(true);
    const onVisibility=()=>{ if(document.visibilityState==='visible') void refreshHome(true); };
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    return ()=>{ window.removeEventListener('focus',onFocus); document.removeEventListener('visibilitychange',onVisibility); };
  }, [householdId, accountCreated, cardCreated]);

  const viewAccounts=useMemo(()=>accounts.filter(item=>inFinancialView(item.scope,view)),[accounts,view]);
  const viewCards=useMemo(()=>cards.filter(item=>inFinancialView(item.scope,view)),[cards,view]);
  const viewTransactions=useMemo(()=>transactions.filter(item=>inFinancialView(item.scope,view)),[transactions,view]);
  const viewCommitments=useMemo(()=>commitments.filter(item=>inFinancialView(item.scope,view)),[commitments,view]);
  const viewInstallmentPlans=useMemo(()=>installmentPlans.filter(item=>inFinancialView(item.scope,view)),[installmentPlans,view]);
  const viewInvoiceImports=useMemo(()=>invoiceImports.filter(item=>inFinancialView(item.scope,view)),[invoiceImports,view]);

  const currentMonthKey=useMemo(()=>{
    const now=new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  },[]);
  const monthTransactions=useMemo(
    ()=>viewTransactions.filter(item=>typeof item.observedOn==='string'&&item.observedOn.startsWith(currentMonthKey)),
    [viewTransactions,currentMonthKey]
  );

  const currentMonthCommitments=useMemo(
    ()=>viewCommitments.filter(item=>!item.paidThisMonth),
    [viewCommitments]
  );

  const cashView=useMemo(()=>deriveCashView({
    transactions:monthTransactions,
    commitments:currentMonthCommitments,
    invoices:viewInvoiceImports
  }),[monthTransactions,currentMonthCommitments,viewInvoiceImports]);

  const cashAccounts=useMemo(
    ()=>viewAccounts.filter(account=>account.connectedProductType!=='investment'),
    [viewAccounts]
  );
  const investmentAccounts=useMemo(
    ()=>viewAccounts.filter(account=>account.connectedProductType==='investment'),
    [viewAccounts]
  );
  const excludedInvestmentMinor=useMemo(
    ()=>investmentAccounts.reduce((sum,account)=>sum+Number(account.balanceMinor??0),0),
    [investmentAccounts]
  );
  const partialInvoiceCount=useMemo(
    ()=>viewInvoiceImports.filter(invoice=>invoice.status==='partial'&&invoice.paymentStatus!=='paid').length,
    [viewInvoiceImports]
  );

  const snapshot = useMemo(() => {
    const availableMinor = cashAccounts
      .reduce((sum, account) => sum + Number(account.balanceMinor ?? 0), 0);
    return deriveHomeSnapshot({
      availableMinor,
      incomeMinor:0,
      paidExpenseMinor:cashView.paidExpenseMinor,
      futureCommitmentsMinor:cashView.futureCommitmentsMinor,
      dueSoonMinor:cashView.futureCommitmentsMinor
    });
  }, [cashAccounts, cashView]);

  const futureMonths=useMemo(()=>projectHouseholdFuture(viewCommitments,viewInstallmentPlans,new Date(),3),[viewCommitments,viewInstallmentPlans]);
  const expandedProjection=futureMonths.find(x=>x.key===expandedFuture)||null;
  const hasData = viewTransactions.length + viewCommitments.length + viewInstallmentPlans.length + viewInvoiceImports.length > 0;
  const hasFirstValue = hasData || viewAccounts.some(account=>account.balanceMinor!==null&&account.balanceMinor!==undefined);

  useEffect(()=>{
    if(!firstValueStartedAtMs||loadingHome||!hasFirstValue||firstValueReportedRef.current) return;
    firstValueReportedRef.current=true;
    reportProductEvent('first_value_observed',{durationMs:Date.now()-firstValueStartedAtMs});
  },[firstValueStartedAtMs,loadingHome,hasFirstValue]);

  const monthHasKnownData = monthTransactions.length + currentMonthCommitments.length + viewInvoiceImports.length > 0;
  const defaultCreateScope=view==='personal'?'personal':'household';
  const viewLabel=view==='household'?l('do Lar','in Household','del Hogar'):view==='personal'?l('Pessoal','Personal','Personal'):l('na sua visão completa','in your full view','en tu vista completa');
  const spendingComparison=useMemo(()=>deriveSpendingComparison(viewTransactions,new Date()),[viewTransactions]);
  const anomalies=useMemo(()=>deriveFinancialAnomalies(viewTransactions,new Date()),[viewTransactions]);
  const attentionItems=useMemo(()=>{
    const now=new Date();
    const today=now.getDate();
    const items:Array<{key:string;code:string;kind:string;title:string;detail:string;reason:string;href:string;action:string;snoozeDays:number}>=[];

    const overdue=viewCommitments
      .filter(item=>!item.paidThisMonth&&item.status!=='paid'&&item.status!=='cancelled'&&Number.isInteger(item.dueDay)&&Number(item.dueDay)<today)
      .sort((a,b)=>Number(a.dueDay)-Number(b.dueDay))[0];
    const dueSoon=viewCommitments
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

    const ending=viewInstallmentPlans
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

    return items.filter(item=>!dismissedAttentionKeys.includes(item.key)).slice(0,3);
  },[viewCommitments,viewInstallmentPlans,anomalies,spendingComparison,proactivity,locale,formatMoney,currentMonthKey,dismissedAttentionKeys]);

  async function snoozeAttention(item:{key:string;code:string;snoozeDays:number}){
    if(!isDismissibleAttentionKind(item.code)||attentionWorking) return;
    setAttentionWorking(item.key);
    setAttentionError('');
    try{
      await dismissAttention({householdId,attentionKey:item.key,snoozeDays:item.snoozeDays});
      setDismissedAttentionKeys(keys=>keys.includes(item.key)?keys:[...keys,item.key]);
    }catch{
      setAttentionError(l('Não conseguimos silenciar este aviso agora.','We could not quiet this alert right now.','No pudimos silenciar este aviso ahora.'));
    }finally{
      setAttentionWorking('');
    }
  }


  return <AppShell
    className={`home-shell ${viewAccounts.length===0?'home-first-use':''}`.trim()}
    subtitle={t.brandTagline}
    canContribute={canContribute}
    householdLink="detailed"
    navClassName="home-primary-nav"
  >
    <div className="home-context-row">
      <div className="home-scope-copy"><span>{l('Visão','View','Vista')}</span><small>{l('Escolha o que entra nesta tela.','Choose what is included on this screen.','Elige qué aparece en esta pantalla.')}</small></div>
      <ScopeViewSwitch value={view} onChange={setView}/>
      {loadingHome && <div className="home-refreshing" role="status"><span aria-hidden="true"/>{l('Atualizando seus dados…','Refreshing your data…','Actualizando tus datos…')}</div>}
    </div>

    {homeError && <p className="error-copy" role="alert">{homeError}</p>}
    <div className={`home-hero-grid ${viewAccounts.length===0?'is-empty':'has-balance'}`}>
    <section className="hero-balance home-balance-card">
      <span>{`${t.availableNow} ${viewLabel}`}</span>
      <strong>{viewAccounts.length ? formatMoney(snapshot.availableMinor) : '—'}</strong>
      <p>{viewAccounts.length ? (snapshot.futureCommitmentsMinor > 0 ? l(`${formatMoney(snapshot.futureCommitmentsMinor)} ainda estão comprometidos ${viewLabel}.`,`${formatMoney(snapshot.futureCommitmentsMinor)} is still committed ${viewLabel}.`,`${formatMoney(snapshot.futureCommitmentsMinor)} todavía está comprometido ${viewLabel}.`) : l(`Sem contas pendentes ${viewLabel}.`,`No pending bills ${viewLabel}.`,`Sin cuentas pendientes ${viewLabel}.`)) : l('Ainda não há saldo informado nesta visão. Adicione uma conta, saldo ou envie um print para começar.','There is no balance entered in this view yet. Add an account, balance, or send a screenshot to get started.','Aún no hay saldo informado en esta vista. Agrega una cuenta, saldo o envía una captura para comenzar.')}</p>
      {viewAccounts.length>0&&<details className="balance-explanation">
        <summary>{l('Como calculamos','How this is calculated','Cómo lo calculamos')}</summary>
        <div className="balance-explanation-grid">
          <div>
            <span>{l('SALDOS INCLUÍDOS','BALANCES INCLUDED','SALDOS INCLUIDOS')}</span>
            <strong>{formatMoney(snapshot.availableMinor)}</strong>
            <small>{l(
              `${cashAccounts.length} conta${cashAccounts.length===1?'':'s'} com saldo disponível nesta visão.`,
              `${cashAccounts.length} account${cashAccounts.length===1?'':'s'} with available balance in this view.`,
              `${cashAccounts.length} cuenta${cashAccounts.length===1?'':'s'} con saldo disponible en esta vista.`
            )}</small>
          </div>
          <div>
            <span>{l('AINDA COMPROMETIDO','STILL COMMITTED','TODAVÍA COMPROMETIDO')}</span>
            <strong>{formatMoney(snapshot.futureCommitmentsMinor)}</strong>
            <small>{l(
              `${formatMoney(cashView.knownCommitmentsMinor)} em contas + ${formatMoney(cashView.openCardInvoicesMinor)} em faturas abertas.`,
              `${formatMoney(cashView.knownCommitmentsMinor)} in bills + ${formatMoney(cashView.openCardInvoicesMinor)} in open statements.`,
              `${formatMoney(cashView.knownCommitmentsMinor)} en cuentas + ${formatMoney(cashView.openCardInvoicesMinor)} en resúmenes abiertos.`
            )}</small>
          </div>
          <div className="projected">
            <span>{l('DEVE SOBRAR','PROJECTED LEFT','DEBERÍA QUEDAR')}</span>
            <strong>{formatMoney(snapshot.projectedRemainderMinor)}</strong>
            <small>{l(
              'Saldo disponível menos compromissos conhecidos. É uma estimativa, não uma garantia.',
              'Available balance minus known commitments. This is an estimate, not a guarantee.',
              'Saldo disponible menos compromisos conocidos. Es una estimación, no una garantía.'
            )}</small>
          </div>
        </div>
        {investmentAccounts.length>0&&<p>{l(
          `Não contamos ${formatMoney(excludedInvestmentMinor)} em ${investmentAccounts.length} investimento${investmentAccounts.length===1?'':'s'} como dinheiro disponível para gastar.`,
          `We do not count ${formatMoney(excludedInvestmentMinor)} across ${investmentAccounts.length} investment account${investmentAccounts.length===1?'':'s'} as money available to spend.`,
          `No contamos ${formatMoney(excludedInvestmentMinor)} en ${investmentAccounts.length} inversión${investmentAccounts.length===1?'':'es'} como dinero disponible para gastar.`
        )}</p>}
        {partialInvoiceCount>0&&<p>{l(
          `${partialInvoiceCount} fatura${partialInvoiceCount===1?' ainda está':'s ainda estão'} em revisão. O valor comprometido pode mudar quando a revisão terminar.`,
          `${partialInvoiceCount} statement${partialInvoiceCount===1?' is':'s are'} still under review. The committed amount may change when review finishes.`,
          `${partialInvoiceCount} resumen${partialInvoiceCount===1?' sigue':'es siguen'} en revisión. El valor comprometido puede cambiar cuando termine la revisión.`
        )}</p>}
      </details>}
    </section>
    {viewAccounts.length===0 && canManage && <AccountOnboarding householdId={householdId} defaultScope={defaultCreateScope} onCreated={()=>{setAccountCreated(v=>v+1);void refreshHome(true);}} />}
    </div>

    {attentionItems.length>0&&<section className="attention-section" aria-labelledby="attention-title">
      <div className="section-title">
        <div>
          <span className="section-kicker">{t.importantNow}</span>
          <h2 id="attention-title">{t.onlyNeedsAttention}</h2>
        </div>
        <small>{t.quietAttention}</small>
      </div>
      <div className="attention-grid">
        {attentionItems.map(item=><article className="attention-card" key={item.key}>
          <span>{item.kind}</span>
          <h3>{item.title}</h3>
          <p>{item.detail}</p>
          <details className="attention-reason">
            <summary>{l('Por que estou vendo isso?','Why am I seeing this?','¿Por qué estoy viendo esto?')}</summary>
            <p>{item.reason}</p>
          </details>
          <div className="attention-actions">
            <Link href={item.href}>{item.action}</Link>
            {isDismissibleAttentionKind(item.code)&&<button type="button" disabled={attentionWorking===item.key} onClick={()=>void snoozeAttention(item)}>
              {attentionWorking===item.key?l('Silenciando…','Quieting…','Silenciando…'):l('Agora não','Not now','Ahora no')}
            </button>}
          </div>
        </article>)}
      </div>
      {attentionError&&<p className="error-copy attention-error" role="alert">{attentionError}</p>}
    </section>}

    {viewAccounts.length>0&&!hasData&&canContribute&&<section className="first-use-guide">
      <div>
        <span className="section-kicker">{l('PRÓXIMO PASSO','NEXT STEP','SIGUIENTE PASO')}</span>
        <h2>{l('Agora deixe o NestBalance trabalhar por você.','Now let NestBalance start working for you.','Ahora deja que NestBalance empiece a trabajar por ti.')}</h2>
        <p>{l(
          'Seu saldo já está aqui. Traga uma conta, compra ou parcela do jeito mais fácil: escrevendo, colando um print ou falando.',
          'Your balance is already here. Bring in a bill, purchase or installment in the easiest way: type it, paste a screenshot or speak.',
          'Tu saldo ya está aquí. Agrega una cuenta, compra o cuota de la forma más fácil: escribiendo, pegando una captura o hablando.'
        )}</p>
      </div>
      <div className="first-use-actions">
        <Link className="primary-button" href="/add">{l('Enviar print, áudio ou texto','Send screenshot, audio, or text','Enviar captura, audio o texto')}</Link>
        <Link className="ghost-button" href="/accounts">{l('Organizar contas e cartões','Organize accounts and cards','Organizar cuentas y tarjetas')}</Link>
      </div>
      <small>{l(
        'Não precisa configurar tudo hoje. O NestBalance melhora conforme você usa.',
        'You do not need to set everything up today. NestBalance gets better as you use it.',
        'No necesitas configurar todo hoy. NestBalance mejora a medida que lo usas.'
      )}</small>
    </section>}

    <MonthlyPayments householdId={householdId} commitments={viewCommitments} canContribute={canContribute} onChanged={()=>void refreshHome(true)} />

    <section className="month-section">
      <div className="section-title">
        <div>
          <h2>{t.month}</h2>
          {!monthHasKnownData&&<span>{l('Ainda sem dados suficientes para resumir este mês.','Not enough data to summarize this month yet.','Aún no hay datos suficientes para resumir este mes.')}</span>}
        </div>
      </div>
      <div className={monthHasKnownData?'month-grid':'month-grid month-grid-unknown'}>
        <div><span>{t.moneyIn}</span><strong>{monthHasKnownData?formatMoney(monthTransactions.filter(x=>x.direction==='income').reduce((s,x)=>s+x.amountMinor,0)):'—'}</strong></div>
        <div><span>{t.moneyOut}</span><strong>{monthHasKnownData?formatMoney(snapshot.paidExpenseMinor):'—'}</strong></div>
        <div><span>{t.moneyToGo}</span><strong>{monthHasKnownData?formatMoney(snapshot.futureCommitmentsMinor):'—'}</strong></div>
        <div className="projected"><span>{t.projectedLeft}{monthHasKnownData&&<small className="estimate-badge">{l('estimado','estimate','estimado')}</small>}</span><strong>{monthHasKnownData&&viewAccounts.length ? formatMoney(snapshot.projectedRemainderMinor) : '—'}</strong></div>
      </div>
    </section>

    <CreditCardManager
      householdId={householdId}
      cards={viewCards}
      accounts={viewAccounts}
      invoiceImports={viewInvoiceImports}
      defaultScope={defaultCreateScope}
      canManage={canManage}
      onCreated={()=>{setCardCreated(v=>v+1);void refreshHome(true);}}
    />

    {hasData&&<section className="future-section">
      <div className="section-title"><h2>{t.nextMonths}</h2><span>{t.committed}</span></div>
      <div className="future-grid">
        {futureMonths.map(item=>{
          const label=monthName.format(new Date(item.year,item.monthIndex,1));
          return <button key={item.key} className={expandedFuture===item.key?'future-card active':'future-card'} onClick={()=>setExpandedFuture(value=>value===item.key?null:item.key)}>
            <span>{label.charAt(0).toUpperCase()+label.slice(1)}</span>
            <strong>{formatMoney(item.totalMinor)}</strong>
            <small>{item.itemCount ? l(`${item.itemCount} compromisso${item.itemCount>1?'s':''}`,`${item.itemCount} commitment${item.itemCount===1?'':'s'}`,`${item.itemCount} compromiso${item.itemCount===1?'':'s'}`) : t.nothingPlanned}</small>
          </button>;
        })}
      </div>
      {expandedProjection && <div className="future-breakdown" role="status">
        <div><span>{t.installments}</span><strong>{formatMoney(expandedProjection.installmentsMinor)}</strong></div>
        <div><span>{t.repeatingBills}</span><strong>{formatMoney(expandedProjection.fixedMinor)}</strong></div>
        <p>{l('É uma projeção com o que já foi confirmado. O NestBalance não presume recorrência só porque existe uma data de vencimento.','This forecast uses only confirmed information. NestBalance does not assume recurrence just because a due date exists.','Esta previsión usa solo información confirmada. NestBalance no supone recurrencia solo porque exista una fecha de vencimiento.')}</p>
      </div>}
    </section>}

    {hasData&&<section className="timeline-section">
      <div className="section-title"><h2>{t.movements}</h2><span>{t.timeline}</span></div>
      {!hasData ? <div className="empty-state"><h3>{t.emptyTitle}</h3><p>{t.emptyBody}</p></div> : <div className="timeline">{viewTransactions.slice(0,8).map(x=><article key={x.id} className="timeline-row"><div className={`movement-dot ${x.direction==='income'?'in':''}`} /><div><strong>{x.description}</strong><span>{x.source==='credit_card_invoice'?l('No cartão','On card','En tarjeta'):x.source==='credit_card_invoice_payment'?l('Fatura paga','Statement paid','Tarjeta pagada'):x.direction==='income'?t.moneyIn:x.direction==='transfer'?l('Transferência','Transfer','Transferencia'):l('Saiu','Money out','Salió')}</span></div><b>{x.source==='credit_card_invoice'?'•':x.direction==='income'?'+':x.direction==='transfer'?'↔':'−'} {formatMoney(x.amountMinor)}</b></article>)}</div>}
    </section>}

  </AppShell>;
}
