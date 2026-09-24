'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { deriveHomeSnapshot } from '@/src/core/summary';
import { deriveCashView } from '@/src/core/cash-view';
import { projectHouseholdFuture } from '@/src/core/future-projection';
import { deriveFinancialAnomalies, deriveSpendingComparison } from '@/src/core/insights';
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
import { DEFAULT_HOME_PREFERENCES, type HomePreferences } from '@/src/core/home-preferences';
import { saveHomePreferences } from '@/src/lib/repositories/home-preferences';
import { deriveHomeAttentionItems, deriveHomeMonthNarrative } from '@/src/features/home/home-attention';
import { HomeFirstUseGuide, HomeFutureSection, HomeMonthSection, HomeTimelineSection } from '@/src/features/home/home-lower-sections';

const AccountOnboarding=dynamic(
  ()=>import('@/src/features/onboarding/account-onboarding').then(module=>module.AccountOnboarding),
  {ssr:false}
);
const CreditCardManager=dynamic(
  ()=>import('@/src/features/cards/card-manager').then(module=>module.CreditCardManager),
  {ssr:false}
);


export function HomeScreen({ householdId, role, firstValueStartedAtMs }: { householdId: string; role: HouseholdRole; firstValueStartedAtMs?:number }) {
  const {t,locale,intlLocale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
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
  const [refreshedAt,setRefreshedAt]=useState<string|null>(null);
  const [hideValues,setHideValues]=useState(false);
  const [homePreferences,setHomePreferences]=useState<HomePreferences>(DEFAULT_HOME_PREFERENCES);
  const [homePreferencesSaving,setHomePreferencesSaving]=useState(false);
  const [homePreferencesError,setHomePreferencesError]=useState('');
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
      setHomePreferences(data.homePreferences||DEFAULT_HOME_PREFERENCES);
      setDismissedAttentionKeys(data.dismissedAttentionKeys||[]);
      setRefreshedAt(data.refreshedAt||new Date().toISOString());
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
  const homeCoverage=viewAccounts.length===0
    ? 'initial'
    : !monthHasKnownData||partialInvoiceCount>0
      ? 'partial'
      : 'high';
  const coverageLabel=homeCoverage==='high'
    ? l('Dados bem cobertos','Well-covered data','Datos bien cubiertos')
    : homeCoverage==='partial'
      ? l('Visão parcial','Partial view','Vista parcial')
      : l('Começando','Getting started','Empezando');
  const refreshedLabel=refreshedAt
    ? new Intl.DateTimeFormat(intlLocale,{hour:'2-digit',minute:'2-digit'}).format(new Date(refreshedAt))
    : null;
  const monthNarrative=useMemo(()=>deriveHomeMonthNarrative({
    accountCount:viewAccounts.length,
    futureCommitmentsMinor:snapshot.futureCommitmentsMinor,
    projectedRemainderMinor:snapshot.projectedRemainderMinor,
    spendingComparison,
    partialInvoiceCount,
    hasData,
    locale,
    formatMoney
  }),[viewAccounts.length,snapshot.futureCommitmentsMinor,snapshot.projectedRemainderMinor,spendingComparison,partialInvoiceCount,hasData,formatMoney,locale]);

  const attentionItems=useMemo(()=>deriveHomeAttentionItems({
    commitments:viewCommitments,
    installmentPlans:viewInstallmentPlans,
    anomalies,
    spendingComparison,
    proactivity,
    locale,
    formatMoney,
    currentMonthKey,
    dismissedKeys:dismissedAttentionKeys
  }),[viewCommitments,viewInstallmentPlans,anomalies,spendingComparison,proactivity,locale,formatMoney,currentMonthKey,dismissedAttentionKeys]);

  async function changeHomePreferences(next:HomePreferences){
    if(homePreferencesSaving) return;
    const previous=homePreferences;
    setHomePreferences(next);
    setHomePreferencesSaving(true);
    setHomePreferencesError('');
    try{
      const saved=await saveHomePreferences(householdId,next);
      setHomePreferences(saved.preferences);
    }catch{
      setHomePreferences(previous);
      setHomePreferencesError(l('Não conseguimos salvar esta preferência agora.','We could not save this preference right now.','No pudimos guardar esta preferencia ahora.'));
    }finally{
      setHomePreferencesSaving(false);
    }
  }
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
    className={`home-shell ${viewAccounts.length===0?'home-first-use':''} ${hideValues?'home-values-hidden':''}`.trim()}
    subtitle={t.brandTagline}
    canContribute={canContribute}
    householdLink="detailed"
    navClassName="home-primary-nav"
  >
    <div className="home-context-row">
      <div className="home-scope-copy"><span>{l('Visão','View','Vista')}</span><small>{l('Escolha o que entra nesta tela.','Choose what is included on this screen.','Elige qué aparece en esta pantalla.')}</small></div>
      <ScopeViewSwitch value={view} onChange={setView}/>
      <div className="home-context-actions">
        <button type="button" className="home-privacy-toggle" aria-pressed={hideValues} onClick={()=>setHideValues(value=>!value)}>
          {hideValues?l('Mostrar valores','Show values','Mostrar valores'):l('Ocultar valores','Hide values','Ocultar valores')}
        </button>
        {loadingHome
          ? <div className="home-refreshing" role="status"><span aria-hidden="true"/>{l('Atualizando seus dados…','Refreshing your data…','Actualizando tus datos…')}</div>
          : <div className={`home-data-quality ${homeCoverage}`} title={l('A qualidade indica quanto da visão vem de dados confirmados.','Quality indicates how much of this view comes from confirmed data.','La calidad indica cuánto de esta vista proviene de datos confirmados.')}>
              <span>{coverageLabel}</span>{refreshedLabel&&<small>{l('atualizado','updated','actualizado')} {refreshedLabel}</small>}
            </div>}
      </div>
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

    {viewAccounts.length>0&&<section className="home-30s" aria-labelledby="home-30s-title">
      <div className="section-title">
        <div>
          <span className="section-kicker">{l('MEU MÊS EM 30 SEGUNDOS','MY MONTH IN 30 SECONDS','MI MES EN 30 SEGUNDOS')}</span>
          <h2 id="home-30s-title">{l('O que importa agora','What matters now','Lo que importa ahora')}</h2>
        </div>
        <small>{homeCoverage==='high'
          ? l('Baseado nos dados confirmados','Based on confirmed data','Basado en datos confirmados')
          : l('Ainda há dados faltando','Some data is still missing','Todavía faltan datos')}</small>
      </div>
      <div className="home-30s-metrics">
        <div><span>{t.availableNow}</span><strong>{formatMoney(snapshot.availableMinor)}</strong></div>
        <div><span>{t.moneyToGo}</span><strong>{monthHasKnownData?formatMoney(snapshot.futureCommitmentsMinor):'—'}</strong></div>
        <div><span>{l('Deve sobrar','Projected left','Debería quedar')}</span><strong>{monthHasKnownData?formatMoney(snapshot.projectedRemainderMinor):'—'}</strong></div>
      </div>
      {monthNarrative.length>0&&<div className="home-30s-story">{monthNarrative.map((item,index)=><p key={index}>{item}</p>)}</div>}
      {homeCoverage==='partial'&&<p className="home-uncertainty-note">{partialInvoiceCount>0
        ? l('Faixa de incerteza: o valor “deve sobrar” pode diminuir quando as faturas em revisão forem concluídas. Não inventamos um limite inferior sem dados.','Uncertainty: “projected left” may decrease when statements under review are completed. We do not invent a lower bound without data.','Incertidumbre: “debería quedar” puede disminuir cuando terminen los resúmenes en revisión. No inventamos un límite inferior sin datos.')
        : l('A projeção ainda é parcial porque faltam movimentos ou compromissos conhecidos neste mês.','The forecast is still partial because known movements or commitments are missing this month.','La previsión todavía es parcial porque faltan movimientos o compromisos conocidos este mes.')}</p>}
      <details className="home-personalization">
        <summary>{l('Ajustar minha visão','Adjust my view','Ajustar mi vista')}</summary>
        <div className="home-personalization-grid">
          <label>
            <span>{l('Como você usa este Lar?','How do you use this Household?','¿Cómo usas este Hogar?')}</span>
            <select disabled={homePreferencesSaving} value={homePreferences.mode} onChange={event=>void changeHomePreferences({...homePreferences,mode:event.target.value as HomePreferences['mode']})}>
              <option value="person">{l('Individual','Individual','Individual')}</option>
              <option value="couple">{l('Casal','Couple','Pareja')}</option>
              <option value="family">{l('Família','Family','Familia')}</option>
            </select>
          </label>
          <label>
            <span>{l('Renda costuma chegar','Income usually arrives','Los ingresos suelen llegar')}</span>
            <select disabled={homePreferencesSaving} value={homePreferences.incomeFrequency} onChange={event=>void changeHomePreferences({...homePreferences,incomeFrequency:event.target.value as HomePreferences['incomeFrequency']})}>
              <option value="monthly">{l('Uma vez por mês','Once a month','Una vez al mes')}</option>
              <option value="biweekly">{l('A cada 15 dias','Every two weeks','Cada 15 días')}</option>
              <option value="weekly">{l('Toda semana','Every week','Cada semana')}</option>
              <option value="variable">{l('Varia','Varies','Varía')}</option>
            </select>
          </label>
        </div>
        <small>{l('Isso ajusta linguagem e prioridades; não altera nenhum cálculo ou registro financeiro.','This adjusts language and priorities; it does not change any financial calculation or record.','Esto ajusta el lenguaje y las prioridades; no cambia ningún cálculo ni registro financiero.')}</small>
        {homePreferencesError&&<p className="error-copy" role="alert">{homePreferencesError}</p>}
      </details>
    </section>}
    {attentionItems.length>0&&<section className="attention-section" aria-labelledby="attention-title">
      <div className="section-title">
        <div>
          <span className="section-kicker">{l('PRIORIDADES','PRIORITIES','PRIORIDADES')}</span>
          <h2 id="attention-title">{l('Faça agora','Do now','Haz ahora')}</h2>
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

    {viewAccounts.length>0&&!hasData&&canContribute&&<HomeFirstUseGuide/>}

    <MonthlyPayments householdId={householdId} commitments={viewCommitments} canContribute={canContribute} onChanged={()=>void refreshHome(true)} />

    <HomeMonthSection
      known={monthHasKnownData}
      incomeMinor={monthTransactions.filter(item=>item.direction==='income').reduce((sum,item)=>sum+item.amountMinor,0)}
      paidExpenseMinor={snapshot.paidExpenseMinor}
      futureCommitmentsMinor={snapshot.futureCommitmentsMinor}
      projectedRemainderMinor={snapshot.projectedRemainderMinor}
      hasAccounts={viewAccounts.length>0}
    />

    <CreditCardManager
      householdId={householdId}
      cards={viewCards}
      accounts={viewAccounts}
      invoiceImports={viewInvoiceImports}
      defaultScope={defaultCreateScope}
      canManage={canManage}
      onCreated={()=>{setCardCreated(v=>v+1);void refreshHome(true);}}
    />

    {hasData&&<HomeFutureSection
      months={futureMonths}
      expandedKey={expandedFuture}
      onToggle={key=>setExpandedFuture(value=>value===key?null:key)}
    />}
    {hasData&&<HomeTimelineSection transactions={viewTransactions}/>}


  </AppShell>;
}
