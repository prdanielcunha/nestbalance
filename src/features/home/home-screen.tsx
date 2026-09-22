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
import { useAppLocale } from '@/src/i18n/locale-provider';
import type { HouseholdRole } from '@/src/core/household';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { loadHomeData, type HomeAccount, type HomeCreditCard, type HomeInstallmentPlan, type HomeInvoiceImport, type HomeRow } from '@/src/lib/repositories/home';

const copy={
  'pt-BR':{
    updateError:'Não conseguimos atualizar sua visão financeira agora.',
    householdView:'do Lar',personalView:'Pessoal',allView:'na sua visão completa',
    expired:'VENCEU',dueToday:'VENCE HOJE',nextPayment:'PRÓXIMO PAGAMENTO',check:'VALE CONFERIR',unusual:'FORA DO PADRÃO',monthChanged:'SEU MÊS MUDOU',ending:'TERMINA LOGO',
    pending:(d:string)=>`${d} ainda aparece como pendente.`,
    expiredDetail:(m:string,day:number)=>`${m} · venceu dia ${day}. Se você já pagou, marque como pago para a previsão ficar correta.`,
    dueTitle:(d:string,today:boolean,day:number)=>`${d} ${today?'vence hoje':`vence dia ${day}`}.`,
    dueDetail:(m:string)=>`${m} já está considerado no que ainda vai sair.`,
    duplicateTitle:(d:string)=>`${d} apareceu mais de uma vez no mesmo dia.`,
    spikeTitle:(d:string)=>`${d} veio acima do histórico conhecido.`,
    duplicateDetail:'Pode estar certo. O NestBalance só está sinalizando para você não pagar ou contar duas vezes sem querer.',
    spikeDetail:(now:string,base:string)=>`${now} agora · histórico típico de ${base}.`,
    spendingTitle:(m:string)=>`Os gastos conhecidos estão ${m} acima do mês anterior.`,
    spendingTop:(category:string,m:string)=>`${category} foi a maior alta até agora, com ${m} a mais.`,
    spendingGeneric:'A comparação usa somente gastos conhecidos e evita contar transferências e pagamento de fatura como nova despesa.',
    endingTitle:(d:string)=>`${d} está na última parcela conhecida.`,
    endingDetail:(m:string)=>`Depois dela, ${m} por mês deixam de estar comprometidos nessa projeção.`,
    seeBill:'Ver conta',understand:'Entender',seeWhy:'Ver por quê',seeInstallments:'Ver parcelas',
    attentionKicker:'O que importa agora',attentionTitle:'Só o que merece sua atenção.',attentionQuiet:'Sem alertar por tudo.',
    balance:'saldo',available:'disponíveis agora',committed:(m:string,v:string)=>`${m} ainda estão comprometidos ${v}.`,noPending:(v:string)=>`Sem contas pendentes ${v}.`,noBalance:(v:string)=>`Ainda não há saldo ${v}.`,
    updating:'Atualizando visão financeira',
    income:'Entrou',paid:'Já saiu',future:'Ainda vai sair',remainder:'Deve sobrar',
    futureMonths:'Próximos meses',alreadyCommitted:'o que já está comprometido',
    commitments:(n:number)=>n?`${n} compromisso${n>1?'s':''}`:'Nada previsto ainda',
    installments:'Parcelas',recurring:'Contas que se repetem',projectionNote:'É uma projeção com o que já foi confirmado. O NestBalance não presume recorrência só porque existe uma data de vencimento.',
    movements:'Movimentos',timeline:'Timeline',
    cardPurchase:'No cartão',invoicePaid:'Fatura paga',synced:'Sincronizado',cameIn:'Entrou',transfer:'Transferência',wentOut:'Saiu',
    householdAccess:'Lar e acessos'
  },
  en:{
    updateError:'We could not refresh your financial view right now.',
    householdView:'in Household',personalView:'in Personal',allView:'in your complete view',
    expired:'OVERDUE',dueToday:'DUE TODAY',nextPayment:'NEXT PAYMENT',check:'WORTH CHECKING',unusual:'OUT OF PATTERN',monthChanged:'YOUR MONTH CHANGED',ending:'ENDING SOON',
    pending:(d:string)=>`${d} still appears as unpaid.`,
    expiredDetail:(m:string,day:number)=>`${m} · was due on day ${day}. If you already paid it, mark it paid so the forecast stays accurate.`,
    dueTitle:(d:string,today:boolean,day:number)=>`${d} ${today?'is due today':`is due on day ${day}`}.`,
    dueDetail:(m:string)=>`${m} is already included in what is still expected to go out.`,
    duplicateTitle:(d:string)=>`${d} appeared more than once on the same day.`,
    spikeTitle:(d:string)=>`${d} is above its known history.`,
    duplicateDetail:'It may be correct. NestBalance is only flagging it so you do not pay or count the same thing twice by accident.',
    spikeDetail:(now:string,base:string)=>`${now} now · typical history ${base}.`,
    spendingTitle:(m:string)=>`Known spending is ${m} above the previous month.`,
    spendingTop:(category:string,m:string)=>`${category} is the largest increase so far, up ${m}.`,
    spendingGeneric:'The comparison uses known expenses only and excludes transfers and credit-card bill payments so the same expense is not counted twice.',
    endingTitle:(d:string)=>`${d} is on its last known installment.`,
    endingDetail:(m:string)=>`After it ends, ${m} per month will no longer be committed in this forecast.`,
    seeBill:'View bill',understand:'Understand',seeWhy:'See why',seeInstallments:'View installments',
    attentionKicker:'What matters now',attentionTitle:'Only what deserves your attention.',attentionQuiet:'No alerts for everything.',
    balance:'balance',available:'available now',committed:(m:string,v:string)=>`${m} is still committed ${v}.`,noPending:(v:string)=>`No pending bills ${v}.`,noBalance:(v:string)=>`There is no balance yet ${v}.`,
    updating:'Refreshing financial view',
    income:'Came in',paid:'Already out',future:'Still to go out',remainder:'Expected left',
    futureMonths:'Next months',alreadyCommitted:'what is already committed',
    commitments:(n:number)=>n?`${n} known commitment${n>1?'s':''}`:'Nothing expected yet',
    installments:'Installments',recurring:'Recurring bills',projectionNote:'This forecast uses only what has already been confirmed. NestBalance does not assume something repeats just because it has a due date.',
    movements:'Activity',timeline:'Timeline',
    cardPurchase:'On card',invoicePaid:'Card bill paid',synced:'Synced',cameIn:'Came in',transfer:'Transfer',wentOut:'Went out',
    householdAccess:'Household & access'
  },
  es:{
    updateError:'No pudimos actualizar tu visión financiera ahora.',
    householdView:'del Hogar',personalView:'Personal',allView:'en tu visión completa',
    expired:'VENCIDO',dueToday:'VENCE HOY',nextPayment:'PRÓXIMO PAGO',check:'CONVIENE REVISAR',unusual:'FUERA DEL PATRÓN',monthChanged:'TU MES CAMBIÓ',ending:'TERMINA PRONTO',
    pending:(d:string)=>`${d} todavía aparece como pendiente.`,
    expiredDetail:(m:string,day:number)=>`${m} · venció el día ${day}. Si ya lo pagaste, márcalo como pagado para que la previsión quede correcta.`,
    dueTitle:(d:string,today:boolean,day:number)=>`${d} ${today?'vence hoy':`vence el día ${day}`}.`,
    dueDetail:(m:string)=>`${m} ya está considerado en lo que todavía saldrá.`,
    duplicateTitle:(d:string)=>`${d} apareció más de una vez el mismo día.`,
    spikeTitle:(d:string)=>`${d} está por encima de su historial conocido.`,
    duplicateDetail:'Puede ser correcto. NestBalance solo lo señala para que no pagues o cuentes lo mismo dos veces sin querer.',
    spikeDetail:(now:string,base:string)=>`${now} ahora · historial típico ${base}.`,
    spendingTitle:(m:string)=>`Los gastos conocidos están ${m} por encima del mes anterior.`,
    spendingTop:(category:string,m:string)=>`${category} fue el mayor aumento hasta ahora, con ${m} más.`,
    spendingGeneric:'La comparación usa solo gastos conocidos y excluye transferencias y pagos de tarjeta para no contar el mismo gasto dos veces.',
    endingTitle:(d:string)=>`${d} está en la última cuota conocida.`,
    endingDetail:(m:string)=>`Después, ${m} al mes dejan de estar comprometidos en esta previsión.`,
    seeBill:'Ver cuenta',understand:'Entender',seeWhy:'Ver por qué',seeInstallments:'Ver cuotas',
    attentionKicker:'Lo que importa ahora',attentionTitle:'Solo lo que merece tu atención.',attentionQuiet:'Sin alertarte por todo.',
    balance:'saldo',available:'disponibles ahora',committed:(m:string,v:string)=>`${m} todavía están comprometidos ${v}.`,noPending:(v:string)=>`Sin cuentas pendientes ${v}.`,noBalance:(v:string)=>`Todavía no hay saldo ${v}.`,
    updating:'Actualizando visión financiera',
    income:'Entró',paid:'Ya salió',future:'Todavía saldrá',remainder:'Debería quedar',
    futureMonths:'Próximos meses',alreadyCommitted:'lo que ya está comprometido',
    commitments:(n:number)=>n?`${n} compromiso${n>1?'s':''}`:'Nada previsto todavía',
    installments:'Cuotas',recurring:'Cuentas que se repiten',projectionNote:'Es una previsión con lo que ya fue confirmado. NestBalance no supone recurrencia solo porque exista una fecha de vencimiento.',
    movements:'Movimientos',timeline:'Línea de tiempo',
    cardPurchase:'En la tarjeta',invoicePaid:'Tarjeta pagada',synced:'Sincronizado',cameIn:'Entró',transfer:'Transferencia',wentOut:'Salió',
    householdAccess:'Hogar y accesos'
  }
} as const;

export function HomeScreen({ householdId, role }: { householdId: string; role: HouseholdRole }) {
  const {locale,t,money,month:monthName}=useAppLocale();
  const c=copy[locale];
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
      setHomeError(c.updateError);
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
  }, [householdId, accountCreated, cardCreated, locale]);

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
  const currentMonthCommitments=useMemo(()=>viewCommitments.filter(item=>!item.paidThisMonth),[viewCommitments]);
  const cashView=useMemo(()=>deriveCashView({transactions:monthTransactions,commitments:currentMonthCommitments,invoices:viewInvoiceImports}),[monthTransactions,currentMonthCommitments,viewInvoiceImports]);

  const snapshot = useMemo(() => {
    const availableMinor = viewAccounts.filter(account=>account.connectedProductType!=='investment').reduce((sum, account) => sum + Number(account.balanceMinor ?? 0), 0);
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
  const viewLabel=view==='household'?c.householdView:view==='personal'?c.personalView:c.allView;
  const spendingComparison=useMemo(()=>deriveSpendingComparison(viewTransactions,new Date()),[viewTransactions]);
  const anomalies=useMemo(()=>deriveFinancialAnomalies(viewTransactions,new Date()),[viewTransactions]);
  const attentionItems=useMemo(()=>{
    const now=new Date();
    const today=now.getDate();
    const items:Array<{key:string;kind:string;title:string;detail:string;href:string;action:string}>=[];
    const overdue=viewCommitments.filter(item=>!item.paidThisMonth&&item.status!=='paid'&&item.status!=='cancelled'&&Number.isInteger(item.dueDay)&&Number(item.dueDay)<today).sort((a,b)=>Number(a.dueDay)-Number(b.dueDay))[0];
    const dueSoon=viewCommitments.filter(item=>!item.paidThisMonth&&item.status!=='paid'&&item.status!=='cancelled'&&Number.isInteger(item.dueDay)&&Number(item.dueDay)>=today&&Number(item.dueDay)<=today+3).sort((a,b)=>Number(a.dueDay)-Number(b.dueDay))[0];

    if(overdue){
      items.push({key:'overdue-'+overdue.id,kind:c.expired,title:c.pending(overdue.description),detail:c.expiredDetail(money.format(overdue.amountMinor/100),Number(overdue.dueDay)),href:'#monthly-payments',action:c.seeBill});
    }else if(dueSoon){
      const isToday=Number(dueSoon.dueDay)===today;
      items.push({key:'due-'+dueSoon.id,kind:isToday?c.dueToday:c.nextPayment,title:c.dueTitle(dueSoon.description,isToday,Number(dueSoon.dueDay)),detail:c.dueDetail(money.format(dueSoon.amountMinor/100)),href:'#monthly-payments',action:c.seeBill});
    }

    const anomaly=anomalies[0];
    if(anomaly){
      items.push({
        key:'anomaly-'+anomaly.transactionId,
        kind:anomaly.type==='possible_duplicate'?c.check:c.unusual,
        title:anomaly.type==='possible_duplicate'?c.duplicateTitle(anomaly.description):c.spikeTitle(anomaly.description),
        detail:anomaly.type==='possible_duplicate'?c.duplicateDetail:c.spikeDetail(money.format(anomaly.amountMinor/100),money.format((anomaly.baselineMinor||0)/100)),
        href:'/assistant',
        action:c.understand
      });
    }

    if(spendingComparison.hasComparableData&&spendingComparison.deltaMinor>0){
      const top=spendingComparison.topIncreases[0];
      items.push({
        key:'spending-change',
        kind:c.monthChanged,
        title:c.spendingTitle(money.format(spendingComparison.deltaMinor/100)),
        detail:top?c.spendingTop(categoryLabel(top.category,locale),money.format(top.deltaMinor/100)):c.spendingGeneric,
        href:'/assistant',
        action:c.seeWhy
      });
    }

    const ending=viewInstallmentPlans.map(plan=>({...plan,remaining:Math.max(0,plan.totalInstallments-plan.lastObservedInstallment)})).filter(plan=>plan.remaining===1&&plan.amountMinor>0).sort((a,b)=>b.amountMinor-a.amountMinor)[0];
    if(ending){
      items.push({key:'ending-'+ending.id,kind:c.ending,title:c.endingTitle(ending.description),detail:c.endingDetail(money.format(ending.amountMinor/100)),href:'/assistant',action:c.seeInstallments});
    }
    return items.slice(0,3);
  },[viewCommitments,viewInstallmentPlans,anomalies,spendingComparison,c,money,locale]);

  return <main className="app-shell">
    <header className="topbar"><div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">{t.brandTagline}</span></div><Link href="/household" className="avatar-dot" aria-label={c.householdAccess} /></header>
    <ScopeViewSwitch value={view} onChange={setView}/>

    {homeError && <p className="error-copy" role="alert">{homeError}</p>}
    {loadingHome && <div className="home-loading-line" aria-label={c.updating} />}
    <section className="hero-balance">
      <span>{viewAccounts.length ? `${c.available} ${viewLabel}` : `${c.balance} ${viewLabel}`}</span>
      <strong>{viewAccounts.length ? money.format(snapshot.availableMinor/100) : '—'}</strong>
      <p>{viewAccounts.length ? (snapshot.futureCommitmentsMinor > 0 ? c.committed(money.format(snapshot.futureCommitmentsMinor/100),viewLabel) : c.noPending(viewLabel)) : c.noBalance(viewLabel)}</p>
    </section>

    {attentionItems.length>0&&<section className="attention-section" aria-labelledby="attention-title">
      <div className="section-title">
        <div><span className="section-kicker">{c.attentionKicker}</span><h2 id="attention-title">{c.attentionTitle}</h2></div>
        <small>{c.attentionQuiet}</small>
      </div>
      <div className="attention-grid">
        {attentionItems.map(item=><article className="attention-card" key={item.key}>
          <span>{item.kind}</span><h3>{item.title}</h3><p>{item.detail}</p><Link href={item.href}>{item.action}</Link>
        </article>)}
      </div>
    </section>}

    {viewAccounts.length===0 && canManage && <AccountOnboarding householdId={householdId} defaultScope={defaultCreateScope} onCreated={()=>{setAccountCreated(v=>v+1);void refreshHome(true);}} />}
    <MonthlyPayments householdId={householdId} commitments={viewCommitments} canContribute={canContribute} onChanged={()=>void refreshHome(true)} />

    <section className="month-section">
      <div className="section-title"><h2>{t.month}</h2></div>
      <div className="month-grid">
        <div><span>{c.income}</span><strong>{money.format(monthTransactions.filter(x=>x.direction==='income').reduce((s,x)=>s+x.amountMinor,0)/100)}</strong></div>
        <div><span>{c.paid}</span><strong>{money.format(snapshot.paidExpenseMinor/100)}</strong></div>
        <div><span>{c.future}</span><strong>{money.format(snapshot.futureCommitmentsMinor/100)}</strong></div>
        <div className="projected"><span>{c.remainder}</span><strong>{viewAccounts.length ? money.format(snapshot.projectedRemainderMinor/100) : '—'}</strong></div>
      </div>
    </section>

    <CreditCardManager householdId={householdId} cards={viewCards} accounts={viewAccounts} invoiceImports={viewInvoiceImports} defaultScope={defaultCreateScope} canManage={canManage} onCreated={()=>{setCardCreated(v=>v+1);void refreshHome(true);}}/>

    <section className="future-section">
      <div className="section-title"><h2>{c.futureMonths}</h2><span>{c.alreadyCommitted}</span></div>
      <div className="future-grid">
        {futureMonths.map(item=>{
          const label=monthName.format(new Date(item.year,item.monthIndex,1));
          return <button key={item.key} className={expandedFuture===item.key?'future-card active':'future-card'} onClick={()=>setExpandedFuture(value=>value===item.key?null:item.key)}>
            <span>{label.charAt(0).toUpperCase()+label.slice(1)}</span><strong>{money.format(item.totalMinor/100)}</strong><small>{c.commitments(item.itemCount)}</small>
          </button>;
        })}
      </div>
      {expandedProjection && <div className="future-breakdown" role="status">
        <div><span>{c.installments}</span><strong>{money.format(expandedProjection.installmentsMinor/100)}</strong></div>
        <div><span>{c.recurring}</span><strong>{money.format(expandedProjection.fixedMinor/100)}</strong></div>
        <p>{c.projectionNote}</p>
      </div>}
    </section>

    <section className="timeline-section">
      <div className="section-title"><h2>{c.movements}</h2><span>{c.timeline}</span></div>
      {!hasData ? <div className="empty-state"><h3>{t.emptyTitle}</h3><p>{t.emptyBody}</p></div> : <div className="timeline">{viewTransactions.slice(0,8).map(x=><article key={x.id} className="timeline-row"><div className={`movement-dot ${x.direction==='income'?'in':''}`} /><div><strong>{x.description}</strong><span>{x.source==='credit_card_invoice'?c.cardPurchase:x.source==='credit_card_invoice_payment'?c.invoicePaid:x.source==='open_finance'?c.synced:x.direction==='income'?c.cameIn:x.direction==='transfer'?c.transfer:c.wentOut}</span></div><b>{x.source==='credit_card_invoice'?'•':x.direction==='income'?'+':x.direction==='transfer'?'↔':'−'} {money.format(x.amountMinor/100)}</b></article>)}</div>}
    </section>

    <AppNav canContribute={canContribute}/>
  </main>;
}
