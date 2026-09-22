'use client';
import { useEffect, useMemo, useState } from 'react';
import { AppNav } from '@/src/features/navigation/app-nav';
import type { HouseholdRole } from '@/src/core/household';
import { loadHomeData, type HomeRow } from '@/src/lib/repositories/home';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { categorizeSpending, categoryLabel, deriveRecurringCandidates, recurringPatternKey } from '@/src/core/insights';
import { confirmRecurringSuggestion, dismissRecurringSuggestion } from '@/src/lib/repositories/recurrences';
import { useAppLocale } from '@/src/i18n/locale-provider';

type Filter='all'|'income'|'cash_expense'|'card'|'transfer';
type ViewScope='household'|'personal';

const copy={
  'pt-BR':{
    title:'Movimentos',history:'Seu histórico',headline:'Tudo que aconteceu com seu dinheiro.',
    intro:'O NestBalance separa o que você recebeu, o que pagou, o que foi para o cartão e o que só mudou de uma conta sua para outra.',
    loadError:'Não conseguimos carregar seus movimentos agora.',
    recurrenceCreateError:'Não conseguimos criar a conta mensal agora. Nada foi alterado.',
    recurrenceDismissError:'Não conseguimos guardar sua preferência agora.',
    pattern:'Padrões que percebemos',monthlyQuestion:'Isso parece acontecer todo mês?',confirmHint:'Nada é criado sem você confirmar.',
    personal:'Só para mim',household:'Lar',seen:(n:number)=>`apareceu em ${n} meses`,
    around:(m:string,day:number|null)=>`Cerca de ${m} por mês${day?' · normalmente perto do dia '+day:''}.`,
    saving:'Salvando…',isMonthly:'É mensal',dontSuggest:'Não sugerir',readOnly:'Somente leitura',
    received:'Recebi',paid:'Paguei',onCard:'No cartão',between:'Entre contas',
    filters:{all:'Todos',income:'Recebi',cash_expense:'Paguei',card:'Cartão',transfer:'Entre contas'},
    search:'Buscar por descrição',empty:'Nada por aqui.',searchEmpty:'Tente outra busca ou filtro.',first:'Quando você registrar o primeiro movimento, ele aparecerá nesta timeline.',
    cardPurchase:'Compra no cartão',invoicePaid:'Fatura paga',bankIncome:'Recebido pelo banco',income:'Dinheiro que entrou',transfer:'Só mudou de conta',bankPaid:'Pago pelo banco',expense:'Dinheiro que saiu',
    installment:(current:number,total:number)=>`Parcela ${current} de ${total}`
  },
  en:{
    title:'Activity',history:'Your history',headline:'Everything that happened with your money.',
    intro:'NestBalance separates what you received, what you paid, what went to a card, and what only moved between your own accounts.',
    loadError:'We could not load your activity right now.',
    recurrenceCreateError:'We could not create the monthly bill right now. Nothing changed.',
    recurrenceDismissError:'We could not save that preference right now.',
    pattern:'Patterns we noticed',monthlyQuestion:'Does this seem to happen every month?',confirmHint:'Nothing is created until you confirm it.',
    personal:'Just me',household:'Household',seen:(n:number)=>`seen in ${n} months`,
    around:(m:string,day:number|null)=>`About ${m} per month${day?' · usually around day '+day:''}.`,
    saving:'Saving…',isMonthly:'It is monthly',dontSuggest:'Do not suggest',readOnly:'Read only',
    received:'Received',paid:'Paid',onCard:'On card',between:'Between accounts',
    filters:{all:'All',income:'Received',cash_expense:'Paid',card:'Card',transfer:'Between accounts'},
    search:'Search by description',empty:'Nothing here.',searchEmpty:'Try another search or filter.',first:'Your first movement will appear in this timeline after you record it.',
    cardPurchase:'Card purchase',invoicePaid:'Card bill paid',bankIncome:'Received through bank',income:'Money came in',transfer:'Only moved accounts',bankPaid:'Paid through bank',expense:'Money went out',
    installment:(current:number,total:number)=>`Installment ${current} of ${total}`
  },
  es:{
    title:'Movimientos',history:'Tu historial',headline:'Todo lo que pasó con tu dinero.',
    intro:'NestBalance separa lo que recibiste, lo que pagaste, lo que fue a la tarjeta y lo que solo cambió de una cuenta tuya a otra.',
    loadError:'No pudimos cargar tus movimientos ahora.',
    recurrenceCreateError:'No pudimos crear la cuenta mensual ahora. Nada cambió.',
    recurrenceDismissError:'No pudimos guardar tu preferencia ahora.',
    pattern:'Patrones que notamos',monthlyQuestion:'¿Esto parece ocurrir cada mes?',confirmHint:'Nada se crea sin tu confirmación.',
    personal:'Solo yo',household:'Hogar',seen:(n:number)=>`apareció en ${n} meses`,
    around:(m:string,day:number|null)=>`Aproximadamente ${m} por mes${day?' · normalmente cerca del día '+day:''}.`,
    saving:'Guardando…',isMonthly:'Es mensual',dontSuggest:'No sugerir',readOnly:'Solo lectura',
    received:'Recibí',paid:'Pagué',onCard:'En tarjeta',between:'Entre cuentas',
    filters:{all:'Todos',income:'Recibí',cash_expense:'Pagué',card:'Tarjeta',transfer:'Entre cuentas'},
    search:'Buscar por descripción',empty:'Nada por aquí.',searchEmpty:'Prueba otra búsqueda o filtro.',first:'Cuando registres el primer movimiento, aparecerá en esta línea de tiempo.',
    cardPurchase:'Compra con tarjeta',invoicePaid:'Tarjeta pagada',bankIncome:'Recibido por el banco',income:'Dinero que entró',transfer:'Solo cambió de cuenta',bankPaid:'Pagado por el banco',expense:'Dinero que salió',
    installment:(current:number,total:number)=>`Cuota ${current} de ${total}`
  }
} as const;

function matchesFilter(row:HomeRow,filter:Filter){
  if(filter==='all') return true;
  if(filter==='income') return row.direction==='income';
  if(filter==='transfer') return row.direction==='transfer';
  if(filter==='card') return row.source==='credit_card_invoice';
  return row.direction==='expense'&&row.source!=='credit_card_invoice';
}

export function MovementsScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {locale,money}=useAppLocale();
  const c=copy[locale];
  const date=useMemo(()=>new Intl.DateTimeFormat(locale==='en'?'en-US':locale,{day:'2-digit',month:'short',year:'numeric'}),[locale]);
  const [rows,setRows]=useState<HomeRow[]>([]);
  const [commitments,setCommitments]=useState<HomeRow[]>([]);
  const [dismissedRecurrenceKeys,setDismissedRecurrenceKeys]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState<Filter>('all');
  const [query,setQuery]=useState('');
  const [view,setView]=useState<FinancialView>('household');
  const [recurrenceWorking,setRecurrenceWorking]=useState('');
  const [recurrenceError,setRecurrenceError]=useState('');

  function rowLabel(row:HomeRow){
    if(row.source==='credit_card_invoice') return c.cardPurchase;
    if(row.source==='credit_card_invoice_payment') return c.invoicePaid;
    if(row.direction==='income') return row.source==='open_finance'?c.bankIncome:c.income;
    if(row.direction==='transfer') return c.transfer;
    return row.source==='open_finance'?c.bankPaid:c.expense;
  }

  async function load(silent=false){
    if(!silent) setLoading(true);
    setError('');
    try{
      const data=await loadHomeData(householdId);
      setRows(data.transactions);
      setCommitments(data.commitments||[]);
      setDismissedRecurrenceKeys(data.dismissedRecurrenceKeys||[]);
    }catch{
      setError(c.loadError);
    }finally{
      if(!silent) setLoading(false);
    }
  }

  useEffect(()=>{void load();},[householdId,locale]);

  const scopedRows=useMemo(()=>rows.filter(row=>inFinancialView(row.scope,view)),[rows,view]);
  const scopedCommitments=useMemo(()=>commitments.filter(row=>inFinancialView(row.scope,view)),[commitments,view]);
  const recurringCandidates=useMemo(()=>{
    const scopes:ViewScope[]=view==='all'?['household','personal']:[view];
    const existing=new Set(
      scopedCommitments
        .filter(item=>item.recurring&&item.status!=='cancelled')
        .map(item=>(item.scope==='personal'?'personal':'household')+'|'+recurringPatternKey(item.description))
    );
    return scopes.flatMap(scope=>{
      const scoped=scopedRows.filter(row=>(row.scope==='personal'?'personal':'household')===scope);
      return deriveRecurringCandidates(scoped).map(candidate=>({...candidate,scope}));
    })
      .filter(candidate=>!dismissedRecurrenceKeys.includes(candidate.scope+'|'+candidate.key))
      .filter(candidate=>!existing.has(candidate.scope+'|'+candidate.key))
      .slice(0,3);
  },[scopedRows,scopedCommitments,dismissedRecurrenceKeys,view]);

  async function handleRecurrence(referenceTransactionId:string,action:'confirm'|'dismiss'){
    if(role==='read_only'||recurrenceWorking) return;
    setRecurrenceWorking(referenceTransactionId);
    setRecurrenceError('');
    try{
      if(action==='confirm') await confirmRecurringSuggestion({householdId,referenceTransactionId});
      else await dismissRecurringSuggestion({householdId,referenceTransactionId});
      await load(true);
    }catch{
      setRecurrenceError(action==='confirm'?c.recurrenceCreateError:c.recurrenceDismissError);
    }finally{
      setRecurrenceWorking('');
    }
  }

  const summary=useMemo(()=>({
    income:scopedRows.filter(x=>x.direction==='income'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    cashExpense:scopedRows.filter(x=>x.direction==='expense'&&x.source!=='credit_card_invoice'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    card:scopedRows.filter(x=>x.source==='credit_card_invoice'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    transfers:scopedRows.filter(x=>x.direction==='transfer'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0)
  }),[scopedRows]);

  const visible=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase(locale==='en'?'en-US':locale);
    return scopedRows.filter(row=>matchesFilter(row,filter)&&(!q||row.description.toLocaleLowerCase(locale==='en'?'en-US':locale).includes(q)));
  },[scopedRows,filter,query,locale]);

  const filters:{value:Filter;label:string}[]=[
    {value:'all',label:c.filters.all},
    {value:'income',label:c.filters.income},
    {value:'cash_expense',label:c.filters.cash_expense},
    {value:'card',label:c.filters.card},
    {value:'transfer',label:c.filters.transfer}
  ];

  return <main className="app-shell movements-shell">
    <header className="topbar"><div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">{c.title}</span></div></header>
    <ScopeViewSwitch value={view} onChange={setView}/>

    <section className="area-hero">
      <span>{c.history}</span><h1>{c.headline}</h1><p>{c.intro}</p>
    </section>

    {recurringCandidates.length>0&&<section className="recurrence-suggestions" aria-labelledby="recurrence-title">
      <div className="section-title">
        <div><span className="section-kicker">{c.pattern}</span><h2 id="recurrence-title">{c.monthlyQuestion}</h2></div>
        <small>{c.confirmHint}</small>
      </div>
      <div className="recurrence-suggestion-list">
        {recurringCandidates.map(candidate=><article key={candidate.scope+'-'+candidate.key} className="recurrence-suggestion-card">
          <div>
            <span>{candidate.scope==='personal'?c.personal:c.household} · {c.seen(candidate.observedMonths)}</span>
            <strong>{candidate.description}</strong>
            <p>{c.around(money.format(candidate.averageMinor/100),candidate.suggestedDueDay)}</p>
          </div>
          {role!=='read_only'
            ? <div className="recurrence-actions">
                <button type="button" disabled={Boolean(recurrenceWorking)} onClick={()=>void handleRecurrence(candidate.referenceTransactionId,'confirm')}>
                  {recurrenceWorking===candidate.referenceTransactionId?c.saving:c.isMonthly}
                </button>
                <button type="button" className="secondary" disabled={Boolean(recurrenceWorking)} onClick={()=>void handleRecurrence(candidate.referenceTransactionId,'dismiss')}>{c.dontSuggest}</button>
              </div>
            : <span className="role-pill">{c.readOnly}</span>}
        </article>)}
      </div>
      {recurrenceError&&<p className="error-copy" role="alert">{recurrenceError}</p>}
    </section>}

    <section className="movement-summary-grid">
      <article><span>{c.received}</span><strong>{money.format(summary.income/100)}</strong></article>
      <article><span>{c.paid}</span><strong>{money.format(summary.cashExpense/100)}</strong></article>
      <article><span>{c.onCard}</span><strong>{money.format(summary.card/100)}</strong></article>
      <article><span>{c.between}</span><strong>{money.format(summary.transfers/100)}</strong></article>
    </section>

    <section className="movement-controls">
      <div className="movement-filter-row">{filters.map(item=><button key={item.value} className={filter===item.value?'active':''} onClick={()=>setFilter(item.value)}>{item.label}</button>)}</div>
      <input className="premium-input movement-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={c.search}/>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {loading
      ? <div className="movement-full-list">{[0,1,2,3].map(i=><div className="movement-full-row skeleton-line" key={i}/>)}</div>
      : visible.length===0
        ? <section className="empty-state"><h3>{c.empty}</h3><p>{query?c.searchEmpty:c.first}</p></section>
        : <section className="movement-full-list">
            {visible.map(row=><article className="movement-full-row" key={row.id}>
              <div className={'movement-dot '+(row.direction==='income'?'in':'')}/>
              <div className="movement-full-copy">
                <strong>{row.description}</strong>
                <span>{rowLabel(row)}{row.scope==='personal'?' · '+c.personal:''}{row.observedOn?' · '+date.format(new Date(row.observedOn+'T12:00:00')):''}</span>
                {row.direction==='expense'&&row.source!=='credit_card_invoice_payment'&&<small>{categoryLabel(categorizeSpending(row.description),locale)}</small>}
                {row.installment&&<small>{c.installment(row.installment.current,row.installment.total)}</small>}
              </div>
              <b className={row.direction==='income'?'positive':''}>{row.source==='credit_card_invoice'?'•':row.direction==='income'?'+':row.direction==='transfer'?'↔':'−'} {money.format(row.amountMinor/100)}</b>
            </article>)}
          </section>}

    <AppNav canContribute={role!=='read_only'}/>
  </main>;
}
