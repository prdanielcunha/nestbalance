'use client';
import { useEffect, useMemo, useState } from 'react';
import { deriveHomeSnapshot } from '@/src/core/summary';
import { deriveCashView } from '@/src/core/cash-view';
import { projectHouseholdFuture } from '@/src/core/future-projection';
import { AccountOnboarding } from '@/src/features/onboarding/account-onboarding';
import { CreditCardManager } from '@/src/features/cards/card-manager';
import { AppNav } from '@/src/features/navigation/app-nav';
import { messages } from '@/src/i18n/messages';
import { loadHomeData, type HomeAccount, type HomeCreditCard, type HomeInstallmentPlan, type HomeInvoiceImport, type HomeRow } from '@/src/lib/repositories/home';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const monthName = new Intl.DateTimeFormat('pt-BR',{month:'long'});

export function HomeScreen({ householdId }: { householdId: string }) {
  const t = messages['pt-BR'];
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

  const cashView=useMemo(()=>deriveCashView({
    transactions,
    commitments,
    invoices:invoiceImports
  }),[transactions,commitments,invoiceImports]);

  const snapshot = useMemo(() => {
    const availableMinor = accounts.reduce((sum, account) => sum + Number(account.balanceMinor ?? 0), 0);
    return deriveHomeSnapshot({
      availableMinor,
      incomeMinor:0,
      paidExpenseMinor:cashView.paidExpenseMinor,
      futureCommitmentsMinor:cashView.futureCommitmentsMinor,
      dueSoonMinor:cashView.futureCommitmentsMinor
    });
  }, [accounts, cashView]);

  const futureMonths=useMemo(()=>projectHouseholdFuture(commitments,installmentPlans,new Date(),3),[commitments,installmentPlans]);
  const expandedProjection=futureMonths.find(x=>x.key===expandedFuture)||null;
  const hasData = transactions.length + commitments.length + installmentPlans.length + invoiceImports.length > 0;

  return <main className="app-shell">
    <header className="topbar"><div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">{t.brandTagline}</span></div><div className="avatar-dot" aria-hidden="true" /></header>

    {homeError && <p className="error-copy" role="alert">{homeError}</p>}
    {loadingHome && <div className="home-loading-line" aria-label="Atualizando visão financeira" />}
    <section className="hero-balance">
      <span>{accounts.length ? t.availableNow : 'saldo disponível'}</span>
      <strong>{accounts.length ? money.format(snapshot.availableMinor/100) : '—'}</strong>
      <p>{accounts.length ? (snapshot.futureCommitmentsMinor > 0 ? `${money.format(snapshot.futureCommitmentsMinor/100)} ainda estão comprometidos.` : 'Sem contas pendentes registradas.') : 'Adicione uma conta ou saldo para vermos quanto está realmente disponível.'}</p>
    </section>

    {accounts.length===0 && <AccountOnboarding householdId={householdId} onCreated={()=>{setAccountCreated(v=>v+1);void refreshHome(true);}} />}
    {commitments[0] && <section><div className="section-title"><h2>{t.attention}</h2></div><article className="spotlight-card"><div><span>{commitments[0].dueDay ? `Vence dia ${commitments[0].dueDay}` : 'Próximo compromisso'}</span><h3>{commitments[0].description}</h3></div><strong>{money.format(commitments[0].amountMinor/100)}</strong></article></section>}

    <section className="month-section">
      <div className="section-title"><h2>{t.month}</h2></div>
      <div className="month-grid">
        <div><span>Entrou</span><strong>{money.format(transactions.filter(x=>x.direction==='income').reduce((s,x)=>s+x.amountMinor,0)/100)}</strong></div>
        <div><span>Já saiu</span><strong>{money.format(snapshot.paidExpenseMinor/100)}</strong></div>
        <div><span>Ainda vai sair</span><strong>{money.format(snapshot.futureCommitmentsMinor/100)}</strong></div>
        <div className="projected"><span>Deve sobrar</span><strong>{accounts.length ? money.format(snapshot.projectedRemainderMinor/100) : '—'}</strong></div>
      </div>
    </section>

    <CreditCardManager
      householdId={householdId}
      cards={cards}
      accounts={accounts}
      invoiceImports={invoiceImports}
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
      {!hasData ? <div className="empty-state"><h3>{t.emptyTitle}</h3><p>{t.emptyBody}</p></div> : <div className="timeline">{transactions.slice(0,8).map(x=><article key={x.id} className="timeline-row"><div className={`movement-dot ${x.direction==='income'?'in':''}`} /><div><strong>{x.description}</strong><span>{x.source==='credit_card_invoice'?'No cartão':x.source==='credit_card_invoice_payment'?'Fatura paga':x.direction==='income'?'Entrou':x.direction==='transfer'?'Transferência':'Saiu'}</span></div><b>{x.source==='credit_card_invoice'?'•':x.direction==='income'?'+':x.direction==='transfer'?'↔':'−'} {money.format(x.amountMinor/100)}</b></article>)}</div>}
    </section>

    <AppNav/>
  </main>;
}
