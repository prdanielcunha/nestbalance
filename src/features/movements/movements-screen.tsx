'use client';
import { useEffect, useMemo, useState } from 'react';
import { AppNav } from '@/src/features/navigation/app-nav';
import type { HouseholdRole } from '@/src/core/household';
import { loadHomeData, type HomeRow } from '@/src/lib/repositories/home';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { categorizeSpending, categoryLabel, deriveRecurringCandidates, recurringPatternKey } from '@/src/core/insights';
import { confirmRecurringSuggestion, dismissRecurringSuggestion } from '@/src/lib/repositories/recurrences';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const date=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'});

type Filter='all'|'income'|'cash_expense'|'card'|'transfer';
type ViewScope='household'|'personal';

function label(row:HomeRow){
  if(row.source==='credit_card_invoice') return 'Compra no cartão';
  if(row.source==='credit_card_invoice_payment') return 'Fatura paga';
  if(row.direction==='income') return row.source==='open_finance'?'Recebido pelo banco':'Dinheiro que entrou';
  if(row.direction==='transfer') return 'Só mudou de conta';
  return row.source==='open_finance'?'Pago pelo banco':'Dinheiro que saiu';
}

function matchesFilter(row:HomeRow,filter:Filter){
  if(filter==='all') return true;
  if(filter==='income') return row.direction==='income';
  if(filter==='transfer') return row.direction==='transfer';
  if(filter==='card') return row.source==='credit_card_invoice';
  return row.direction==='expense'&&row.source!=='credit_card_invoice';
}

export function MovementsScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
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

  async function load(silent=false){
    if(!silent) setLoading(true);
    setError('');
    try{
      const data=await loadHomeData(householdId);
      setRows(data.transactions);
      setCommitments(data.commitments||[]);
      setDismissedRecurrenceKeys(data.dismissedRecurrenceKeys||[]);
    }catch{
      setError('Não conseguimos carregar seus movimentos agora.');
    }finally{
      if(!silent) setLoading(false);
    }
  }

  useEffect(()=>{void load();},[householdId]);

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
      setRecurrenceError(action==='confirm'
        ? 'Não conseguimos criar a conta mensal agora. Nada foi alterado.'
        : 'Não conseguimos guardar sua preferência agora.');
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
    const q=query.trim().toLocaleLowerCase('pt-BR');
    return scopedRows.filter(row=>matchesFilter(row,filter)&&(!q||row.description.toLocaleLowerCase('pt-BR').includes(q)));
  },[scopedRows,filter,query]);

  const filters:{value:Filter;label:string}[]=[
    {value:'all',label:'Todos'},
    {value:'income',label:'Recebi'},
    {value:'cash_expense',label:'Paguei'},
    {value:'card',label:'Cartão'},
    {value:'transfer',label:'Entre contas'}
  ];

  return <main className="app-shell movements-shell">
    <header className="topbar">
      <div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">Movimentos</span></div>
    </header>
    <ScopeViewSwitch value={view} onChange={setView}/>

    <section className="area-hero">
      <span>Seu histórico</span>
      <h1>Tudo que aconteceu com seu dinheiro.</h1>
      <p>O NestBalance separa o que você recebeu, o que pagou, o que foi para o cartão e o que só mudou de uma conta sua para outra.</p>
    </section>

    {recurringCandidates.length>0&&<section className="recurrence-suggestions" aria-labelledby="recurrence-title">
      <div className="section-title">
        <div>
          <span className="section-kicker">Padrões que percebemos</span>
          <h2 id="recurrence-title">Isso parece acontecer todo mês?</h2>
        </div>
        <small>Nada é criado sem você confirmar.</small>
      </div>
      <div className="recurrence-suggestion-list">
        {recurringCandidates.map(candidate=><article key={candidate.scope+'-'+candidate.key} className="recurrence-suggestion-card">
          <div>
            <span>{candidate.scope==='personal'?'Só para mim':'Lar'} · apareceu em {candidate.observedMonths} meses</span>
            <strong>{candidate.description}</strong>
            <p>Cerca de {money.format(candidate.averageMinor/100)} por mês{candidate.suggestedDueDay?' · normalmente perto do dia '+candidate.suggestedDueDay:''}.</p>
          </div>
          {role!=='read_only'
            ? <div className="recurrence-actions">
                <button type="button" disabled={Boolean(recurrenceWorking)} onClick={()=>void handleRecurrence(candidate.referenceTransactionId,'confirm')}>
                  {recurrenceWorking===candidate.referenceTransactionId?'Salvando…':'É mensal'}
                </button>
                <button type="button" className="secondary" disabled={Boolean(recurrenceWorking)} onClick={()=>void handleRecurrence(candidate.referenceTransactionId,'dismiss')}>
                  Não sugerir
                </button>
              </div>
            : <span className="role-pill">Somente leitura</span>}
        </article>)}
      </div>
      {recurrenceError&&<p className="error-copy" role="alert">{recurrenceError}</p>}
    </section>}

    <section className="movement-summary-grid">
      <article><span>Recebi</span><strong>{money.format(summary.income/100)}</strong></article>
      <article><span>Paguei</span><strong>{money.format(summary.cashExpense/100)}</strong></article>
      <article><span>No cartão</span><strong>{money.format(summary.card/100)}</strong></article>
      <article><span>Entre contas</span><strong>{money.format(summary.transfers/100)}</strong></article>
    </section>

    <section className="movement-controls">
      <div className="movement-filter-row">
        {filters.map(item=><button key={item.value} className={filter===item.value?'active':''} onClick={()=>setFilter(item.value)}>{item.label}</button>)}
      </div>
      <input className="premium-input movement-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por descrição"/>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {loading
      ? <div className="movement-full-list">{[0,1,2,3].map(i=><div className="movement-full-row skeleton-line" key={i}/>)}</div>
      : visible.length===0
        ? <section className="empty-state"><h3>Nada por aqui.</h3><p>{query?'Tente outra busca ou filtro.':'Quando você registrar o primeiro movimento, ele aparecerá nesta timeline.'}</p></section>
        : <section className="movement-full-list">
            {visible.map(row=><article className="movement-full-row" key={row.id}>
              <div className={'movement-dot '+(row.direction==='income'?'in':'')}/>
              <div className="movement-full-copy">
                <strong>{row.description}</strong>
                <span>{label(row)}{row.scope==='personal'?' · Só para mim':''}{row.observedOn?' · '+date.format(new Date(row.observedOn+'T12:00:00')):''}</span>
                {row.direction==='expense'&&row.source!=='credit_card_invoice_payment'&&<small>{categoryLabel(categorizeSpending(row.description))}</small>}
                {row.installment&&<small>Parcela {row.installment.current} de {row.installment.total}</small>}
              </div>
              <b className={row.direction==='income'?'positive':''}>{row.source==='credit_card_invoice'?'•':row.direction==='income'?'+':row.direction==='transfer'?'↔':'−'} {money.format(row.amountMinor/100)}</b>
            </article>)}
          </section>}

    <AppNav canContribute={role!=='read_only'}/>
  </main>;
}
