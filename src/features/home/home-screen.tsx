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
import { messages } from '@/src/i18n/messages';
import type { HouseholdRole } from '@/src/core/household';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { loadHomeData, type HomeAccount, type HomeCreditCard, type HomeInstallmentPlan, type HomeInvoiceImport, type HomeRow } from '@/src/lib/repositories/home';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const monthName = new Intl.DateTimeFormat('pt-BR',{month:'long'});

export function HomeScreen({ householdId, role }: { householdId: string; role: HouseholdRole }) {
  const t = messages['pt-BR'];
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
      setHomeError('');
    }catch{
      setHomeError('Não conseguimos atualizar sua visão financeira agora.');
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
  const viewLabel=view==='household'?'do Lar':view==='personal'?'Pessoal':'na sua visão completa';
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

    if(overdue){
      items.push({
        key:'overdue-'+overdue.id,
        kind:'VENCEU',
        title:`${overdue.description} ainda aparece como pendente.`,
        detail:`${money.format(overdue.amountMinor/100)} · venceu dia ${overdue.dueDay}. Se você já pagou, marque como pago para a previsão ficar correta.`,
        href:'#monthly-payments',
        action:'Ver conta'
      });
    }else if(dueSoon){
      items.push({
        key:'due-'+dueSoon.id,
        kind:Number(dueSoon.dueDay)===today?'VENCE HOJE':'PRÓXIMO PAGAMENTO',
        title:`${dueSoon.description} ${Number(dueSoon.dueDay)===today?'vence hoje':`vence dia ${dueSoon.dueDay}`}.`,
        detail:`${money.format(dueSoon.amountMinor/100)} já está considerado no que ainda vai sair.`,
        href:'#monthly-payments',
        action:'Ver conta'
      });
    }

    const anomaly=anomalies[0];
    if(anomaly){
      items.push({
        key:'anomaly-'+anomaly.transactionId,
        kind:anomaly.type==='possible_duplicate'?'VALE CONFERIR':'FORA DO PADRÃO',
        title:anomaly.type==='possible_duplicate'
          ? `${anomaly.description} apareceu mais de uma vez no mesmo dia.`
          : `${anomaly.description} veio acima do histórico conhecido.`,
        detail:anomaly.type==='possible_duplicate'
          ? 'Pode estar certo. O NestBalance só está sinalizando para você não pagar ou contar duas vezes sem querer.'
          : `${money.format(anomaly.amountMinor/100)} agora · histórico típico de ${money.format((anomaly.baselineMinor||0)/100)}.`,
        href:'/assistant',
        action:'Entender'
      });
    }

    if(spendingComparison.hasComparableData&&spendingComparison.deltaMinor>0){
      const top=spendingComparison.topIncreases[0];
      items.push({
        key:'spending-change',
        kind:'SEU MÊS MUDOU',
        title:`Os gastos conhecidos estão ${money.format(spendingComparison.deltaMinor/100)} acima do mês anterior.`,
        detail:top
          ? `${categoryLabel(top.category)} foi a maior alta até agora, com ${money.format(top.deltaMinor/100)} a mais.`
          : 'A comparação usa somente gastos conhecidos e evita contar transferências e pagamento de fatura como nova despesa.',
        href:'/assistant',
        action:'Ver por quê'
      });
    }

    const ending=viewInstallmentPlans
      .map(plan=>({...plan,remaining:Math.max(0,plan.totalInstallments-plan.lastObservedInstallment)}))
      .filter(plan=>plan.remaining===1&&plan.amountMinor>0)
      .sort((a,b)=>b.amountMinor-a.amountMinor)[0];
    if(ending){
      items.push({
        key:'ending-'+ending.id,
        kind:'TERMINA LOGO',
        title:`${ending.description} está na última parcela conhecida.`,
        detail:`Depois dela, ${money.format(ending.amountMinor/100)} por mês deixam de estar comprometidos nessa projeção.`,
        href:'/assistant',
        action:'Ver parcelas'
      });
    }

    return items.slice(0,3);
  },[viewCommitments,viewInstallmentPlans,anomalies,spendingComparison]);


  return <main className="app-shell">
    <header className="topbar"><div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">{t.brandTagline}</span></div><Link href="/household" className="avatar-dot" aria-label="Lar e acessos" /></header>
    <ScopeViewSwitch value={view} onChange={setView}/>

    {homeError && <p className="error-copy" role="alert">{homeError}</p>}
    {loadingHome && <div className="home-loading-line" aria-label="Atualizando visão financeira" />}
    <section className="hero-balance">
      <span>{viewAccounts.length ? `${t.availableNow} ${viewLabel}` : `saldo ${viewLabel}`}</span>
      <strong>{viewAccounts.length ? money.format(snapshot.availableMinor/100) : '—'}</strong>
      <p>{viewAccounts.length ? (snapshot.futureCommitmentsMinor > 0 ? `${money.format(snapshot.futureCommitmentsMinor/100)} ainda estão comprometidos ${viewLabel}.` : `Sem contas pendentes ${viewLabel}.`) : `Ainda não há saldo ${viewLabel}.`}</p>
    </section>

    {attentionItems.length>0&&<section className="attention-section" aria-labelledby="attention-title">
      <div className="section-title">
        <div>
          <span className="section-kicker">O que importa agora</span>
          <h2 id="attention-title">Só o que merece sua atenção.</h2>
        </div>
        <small>Sem alertar por tudo.</small>
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
        <div><span>Entrou</span><strong>{money.format(monthTransactions.filter(x=>x.direction==='income').reduce((s,x)=>s+x.amountMinor,0)/100)}</strong></div>
        <div><span>Já saiu</span><strong>{money.format(snapshot.paidExpenseMinor/100)}</strong></div>
        <div><span>Ainda vai sair</span><strong>{money.format(snapshot.futureCommitmentsMinor/100)}</strong></div>
        <div className="projected"><span>Deve sobrar</span><strong>{viewAccounts.length ? money.format(snapshot.projectedRemainderMinor/100) : '—'}</strong></div>
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
      <div className="section-title"><h2>Próximos meses</h2><span>o que já está comprometido</span></div>
      <div className="future-grid">
        {futureMonths.map(item=>{
          const label=monthName.format(new Date(item.year,item.monthIndex,1));
          return <button key={item.key} className={expandedFuture===item.key?'future-card active':'future-card'} onClick={()=>setExpandedFuture(value=>value===item.key?null:item.key)}>
            <span>{label.charAt(0).toUpperCase()+label.slice(1)}</span>
            <strong>{money.format(item.totalMinor/100)}</strong>
            <small>{item.itemCount ? `${item.itemCount} compromisso${item.itemCount>1?'s':''}` : 'Nada previsto ainda'}</small>
          </button>;
        })}
      </div>
      {expandedProjection && <div className="future-breakdown" role="status">
        <div><span>Parcelas</span><strong>{money.format(expandedProjection.installmentsMinor/100)}</strong></div>
        <div><span>Contas que se repetem</span><strong>{money.format(expandedProjection.fixedMinor/100)}</strong></div>
        <p>É uma projeção com o que já foi confirmado. O NestBalance não presume recorrência só porque existe uma data de vencimento.</p>
      </div>}
    </section>

    <section className="timeline-section">
      <div className="section-title"><h2>Movimentos</h2><span>Timeline</span></div>
      {!hasData ? <div className="empty-state"><h3>{t.emptyTitle}</h3><p>{t.emptyBody}</p></div> : <div className="timeline">{viewTransactions.slice(0,8).map(x=><article key={x.id} className="timeline-row"><div className={`movement-dot ${x.direction==='income'?'in':''}`} /><div><strong>{x.description}</strong><span>{x.source==='credit_card_invoice'?'No cartão':x.source==='credit_card_invoice_payment'?'Fatura paga':x.source==='open_finance'?'Sincronizado':x.direction==='income'?'Entrou':x.direction==='transfer'?'Transferência':'Saiu'}</span></div><b>{x.source==='credit_card_invoice'?'•':x.direction==='income'?'+':x.direction==='transfer'?'↔':'−'} {money.format(x.amountMinor/100)}</b></article>)}</div>}
    </section>

    <AppNav canContribute={canContribute}/>
  </main>;
}
