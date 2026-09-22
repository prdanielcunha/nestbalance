'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { deriveHomeSnapshot } from '@/src/core/summary';
import { deriveCashView } from '@/src/core/cash-view';
import { projectHouseholdFuture } from '@/src/core/future-projection';
import { categoryLabel, deriveFinancialAnomalies, deriveSpendingComparison } from '@/src/core/insights';
import { AccountOnboarding } from '@/src/features/onboarding/account-onboarding';
import { CreditCardManager } from '@/src/features/cards/card-manager';
import { MonthlyPayments } from '@/src/features/payments/monthly-payments';
import { AppNav } from '@/src/features/navigation/app-nav';
import { useI18n } from '@/src/i18n/locale-provider';
import type { HouseholdRole } from '@/src/core/household';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { loadHomeData, type HomeAccount, type HomeCreditCard, type HomeInstallmentPlan, type HomeInvoiceImport, type HomeRow } from '@/src/lib/repositories/home';
import { DEFAULT_PROACTIVITY_PREFERENCES, type ProactivityPreferences } from '@/src/core/proactivity';


export function HomeScreen({ householdId, role }: { householdId: string; role: HouseholdRole }) {
  const {t,locale,intlLocale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const monthName=useMemo(()=>new Intl.DateTimeFormat(intlLocale,{month:'long'}),[intlLocale]);
  const canManage = role === 'owner' || role === 'admin';
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
      setHomeError('');
    }catch{
      setHomeError(l('Não conseguimos atualizar sua visão financeira agora.','We could not refresh your financial view right now.','No pudimos actualizar tu visión financiera ahora.'));
    }finally{
      if(!silent) setLoadingHome(false);
    }
  }

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

  const snapshot = useMemo(() => {
    const availableMinor = viewAccounts
      .filter(account=>account.connectedProductType!=='investment')
      .reduce((sum, account) => sum + Number(account.balanceMinor ?? 0), 0);
    return deriveHomeSnapshot({
      availableMinor,
      incomeMinor:0,
      paidExpenseMinor:cashView.paidExpenseMinor,
      futureCommitmentsMinor:cashView.futureCommitmentsMinor,
      dueSoonMinor:cashView.futureCommitmentsMinor
    });
  }, [viewAccounts, cashView]);

  const futureMonths=useMemo(()=>projectHouseholdFuture(viewCommitments,viewInstallmentPlans,new Date(),3),[viewCommitments,viewInstallmentPlans]);
  const expandedProjection=futureMonths.find(x=>x.key===expandedFuture)||null;
  const hasData = viewTransactions.length + viewCommitments.length + viewInstallmentPlans.length + viewInvoiceImports.length > 0;
  const defaultCreateScope=view==='personal'?'personal':'household';
  const viewLabel=view==='household'?l('do Lar','in Household','del Hogar'):view==='personal'?l('Pessoal','Personal','Personal'):l('na sua visão completa','in your full view','en tu vista completa');
  const spendingComparison=useMemo(()=>deriveSpendingComparison(viewTransactions,new Date()),[viewTransactions]);
  const anomalies=useMemo(()=>deriveFinancialAnomalies(viewTransactions,new Date()),[viewTransactions]);
  const attentionItems=useMemo(()=>{
    const now=new Date();
    const today=now.getDate();
    const items:Array<{key:string;kind:string;title:string;detail:string;href:string;action:string}>=[];

    const overdue=viewCommitments
      .filter(item=>!item.paidThisMonth&&item.status!=='paid'&&item.status!=='cancelled'&&Number.isInteger(item.dueDay)&&Number(item.dueDay)<today)
      .sort((a,b)=>Number(a.dueDay)-Number(b.dueDay))[0];
    const dueSoon=viewCommitments
      .filter(item=>!item.paidThisMonth&&item.status!=='paid'&&item.status!=='cancelled'&&Number.isInteger(item.dueDay)&&Number(item.dueDay)>=today&&Number(item.dueDay)<=today+3)
      .sort((a,b)=>Number(a.dueDay)-Number(b.dueDay))[0];

    if(proactivity.dueBills&&overdue){
      items.push({
        key:'overdue-'+overdue.id,
        kind:l('VENCEU','OVERDUE','VENCIDA'),
        title:l(`${overdue.description} ainda aparece como pendente.`,`${overdue.description} still appears unpaid.`,`${overdue.description} todavía aparece pendiente.`),
        detail:l(`${formatMoney(overdue.amountMinor)} · venceu dia ${overdue.dueDay}. Se você já pagou, marque como pago para a previsão ficar correta.`,`${formatMoney(overdue.amountMinor)} · due on day ${overdue.dueDay}. If you already paid it, mark it paid so the forecast stays accurate.`,`${formatMoney(overdue.amountMinor)} · venció el día ${overdue.dueDay}. Si ya pagaste, márcalo como pagado para mantener correcta la previsión.`),
        href:'#monthly-payments',
        action:l('Ver conta','View bill','Ver cuenta')
      });
    }else if(proactivity.dueBills&&dueSoon){
      items.push({
        key:'due-'+dueSoon.id,
        kind:Number(dueSoon.dueDay)===today?l('VENCE HOJE','DUE TODAY','VENCE HOY'):l('PRÓXIMO PAGAMENTO','UPCOMING PAYMENT','PRÓXIMO PAGO'),
        title:l(`${dueSoon.description} ${Number(dueSoon.dueDay)===today?'vence hoje':`vence dia ${dueSoon.dueDay}`}.`,`${dueSoon.description} ${Number(dueSoon.dueDay)===today?'is due today':`is due on day ${dueSoon.dueDay}`}.`,`${dueSoon.description} ${Number(dueSoon.dueDay)===today?'vence hoy':`vence el día ${dueSoon.dueDay}`}.`),
        detail:l(`${formatMoney(dueSoon.amountMinor)} já está considerado no que ainda vai sair.`,`${formatMoney(dueSoon.amountMinor)} is already included in what is still expected to leave.`,`${formatMoney(dueSoon.amountMinor)} ya está incluido en lo que todavía saldrá.`),
        href:'#monthly-payments',
        action:l('Ver conta','View bill','Ver cuenta')
      });
    }

    const anomaly=anomalies[0];
    if(proactivity.anomalies&&anomaly){
      items.push({
        key:'anomaly-'+anomaly.transactionId,
        kind:anomaly.type==='possible_duplicate'?l('VALE CONFERIR','WORTH CHECKING','CONVIENE REVISAR'):l('FORA DO PADRÃO','OUT OF PATTERN','FUERA DEL PATRÓN'),
        title:anomaly.type==='possible_duplicate'
          ? l(`${anomaly.description} apareceu mais de uma vez no mesmo dia.`,`${anomaly.description} appeared more than once on the same day.`,`${anomaly.description} apareció más de una vez el mismo día.`)
          : l(`${anomaly.description} veio acima do histórico conhecido.`,`${anomaly.description} is above its known history.`,`${anomaly.description} está por encima de su historial conocido.`),
        detail:anomaly.type==='possible_duplicate'
          ? l('Pode estar certo. O NestBalance só está sinalizando para você não pagar ou contar duas vezes sem querer.','It may be correct. NestBalance is only flagging it so you do not pay or count it twice by mistake.','Puede estar bien. NestBalance solo lo señala para evitar pagar o contar dos veces por error.')
          : l(`${formatMoney(anomaly.amountMinor)} agora · histórico típico de ${formatMoney(anomaly.baselineMinor||0)}.`,`${formatMoney(anomaly.amountMinor)} now · typical history ${formatMoney(anomaly.baselineMinor||0)}.`,`${formatMoney(anomaly.amountMinor)} ahora · historial típico ${formatMoney(anomaly.baselineMinor||0)}.`),
        href:'/assistant',
        action:l('Entender','Understand','Entender')
      });
    }

    if(proactivity.spendingChanges&&spendingComparison.hasComparableData&&spendingComparison.deltaMinor>0){
      const top=spendingComparison.topIncreases[0];
      items.push({
        key:'spending-change',
        kind:l('SEU MÊS MUDOU','YOUR MONTH CHANGED','TU MES CAMBIÓ'),
        title:l(`Os gastos conhecidos estão ${formatMoney(spendingComparison.deltaMinor)} acima do mês anterior.`,`Known spending is ${formatMoney(spendingComparison.deltaMinor)} above last month.`,`Los gastos conocidos están ${formatMoney(spendingComparison.deltaMinor)} por encima del mes anterior.`),
        detail:top
          ? l(`${categoryLabel(top.category,'pt-BR')} foi a maior alta até agora, com ${formatMoney(top.deltaMinor)} a mais.`,`${categoryLabel(top.category,'en')} had the biggest increase so far, up ${formatMoney(top.deltaMinor)}.`,`${categoryLabel(top.category,'es')} fue el mayor aumento hasta ahora, con ${formatMoney(top.deltaMinor)} más.`)
          : l('A comparação usa somente gastos conhecidos e evita contar transferências e pagamento de fatura como nova despesa.','The comparison uses only known spending and excludes transfers and statement payments so expenses are not counted twice.','La comparación usa solo gastos conocidos y excluye transferencias y pagos de tarjeta para no contar el gasto dos veces.'),
        href:'/assistant',
        action:l('Ver por quê','See why','Ver por qué')
      });
    }

    const ending=viewInstallmentPlans
      .map(plan=>({...plan,remaining:Math.max(0,plan.totalInstallments-plan.lastObservedInstallment)}))
      .filter(plan=>plan.remaining===1&&plan.amountMinor>0)
      .sort((a,b)=>b.amountMinor-a.amountMinor)[0];
    if(proactivity.installmentEnds&&ending){
      items.push({
        key:'ending-'+ending.id,
        kind:l('TERMINA LOGO','ENDING SOON','TERMINA PRONTO'),
        title:l(`${ending.description} está na última parcela conhecida.`,`${ending.description} is on its last known installment.`,`${ending.description} está en su última cuota conocida.`),
        detail:l(`Depois dela, ${formatMoney(ending.amountMinor)} por mês deixam de estar comprometidos nessa projeção.`,`After it ends, ${formatMoney(ending.amountMinor)} per month is no longer committed in this forecast.`,`Después, ${formatMoney(ending.amountMinor)} al mes dejan de estar comprometidos en esta previsión.`),
        href:'/assistant',
        action:l('Ver parcelas','View installments','Ver cuotas')
      });
    }

    return items.slice(0,3);
  },[viewCommitments,viewInstallmentPlans,anomalies,spendingComparison,proactivity,locale,formatMoney]);


  return <main className="app-shell">
    <header className="topbar"><div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">{t.brandTagline}</span></div><Link href="/household" className="avatar-dot" aria-label={t.householdSettings} /></header>
    <ScopeViewSwitch value={view} onChange={setView}/>

    {homeError && <p className="error-copy" role="alert">{homeError}</p>}
    {loadingHome && <div className="home-loading-line" aria-label={l('Atualizando visão financeira','Refreshing financial view','Actualizando visión financiera')} />}
    <section className="hero-balance">
      <span>{viewAccounts.length ? `${t.availableNow} ${viewLabel}` : l(`saldo ${viewLabel}`,`balance ${viewLabel}`,`saldo ${viewLabel}`)}</span>
      <strong>{viewAccounts.length ? formatMoney(snapshot.availableMinor) : '—'}</strong>
      <p>{viewAccounts.length ? (snapshot.futureCommitmentsMinor > 0 ? l(`${formatMoney(snapshot.futureCommitmentsMinor)} ainda estão comprometidos ${viewLabel}.`,`${formatMoney(snapshot.futureCommitmentsMinor)} is still committed ${viewLabel}.`,`${formatMoney(snapshot.futureCommitmentsMinor)} todavía está comprometido ${viewLabel}.`) : l(`Sem contas pendentes ${viewLabel}.`,`No pending bills ${viewLabel}.`,`Sin cuentas pendientes ${viewLabel}.`)) : l(`Ainda não há saldo ${viewLabel}.`,`There is no balance yet ${viewLabel}.`,`Todavía no hay saldo ${viewLabel}.`)}</p>
    </section>

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
          <Link href={item.href}>{item.action}</Link>
        </article>)}
      </div>
    </section>}

    {viewAccounts.length===0 && canManage && <AccountOnboarding householdId={householdId} defaultScope={defaultCreateScope} onCreated={()=>{setAccountCreated(v=>v+1);void refreshHome(true);}} />}
    <MonthlyPayments householdId={householdId} commitments={viewCommitments} canContribute={canContribute} onChanged={()=>void refreshHome(true)} />

    <section className="month-section">
      <div className="section-title"><h2>{t.month}</h2></div>
      <div className="month-grid">
        <div><span>{t.moneyIn}</span><strong>{formatMoney(monthTransactions.filter(x=>x.direction==='income').reduce((s,x)=>s+x.amountMinor,0))}</strong></div>
        <div><span>{t.moneyOut}</span><strong>{formatMoney(snapshot.paidExpenseMinor)}</strong></div>
        <div><span>{t.moneyToGo}</span><strong>{formatMoney(snapshot.futureCommitmentsMinor)}</strong></div>
        <div className="projected"><span>{t.projectedLeft}</span><strong>{viewAccounts.length ? formatMoney(snapshot.projectedRemainderMinor) : '—'}</strong></div>
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

    <section className="future-section">
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
    </section>

    <section className="timeline-section">
      <div className="section-title"><h2>{t.movements}</h2><span>{t.timeline}</span></div>
      {!hasData ? <div className="empty-state"><h3>{t.emptyTitle}</h3><p>{t.emptyBody}</p></div> : <div className="timeline">{viewTransactions.slice(0,8).map(x=><article key={x.id} className="timeline-row"><div className={`movement-dot ${x.direction==='income'?'in':''}`} /><div><strong>{x.description}</strong><span>{x.source==='credit_card_invoice'?l('No cartão','On card','En tarjeta'):x.source==='credit_card_invoice_payment'?l('Fatura paga','Statement paid','Tarjeta pagada'):x.source==='open_finance'?l('Sincronizado','Synced','Sincronizado'):x.direction==='income'?t.moneyIn:x.direction==='transfer'?l('Transferência','Transfer','Transferencia'):l('Saiu','Money out','Salió')}</span></div><b>{x.source==='credit_card_invoice'?'•':x.direction==='income'?'+':x.direction==='transfer'?'↔':'−'} {formatMoney(x.amountMinor)}</b></article>)}</div>}
    </section>

    <AppNav canContribute={canContribute}/>
  </main>;
}
