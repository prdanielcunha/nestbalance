'use client';
import { useEffect, useMemo, useState } from 'react';
import { AppNav } from '@/src/features/navigation/app-nav';
import type { HouseholdRole } from '@/src/core/household';
import { loadHomeData, type HomeRow } from '@/src/lib/repositories/home';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const date=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'});

type Filter='all'|'income'|'cash_expense'|'card'|'transfer';

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
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState<Filter>('all');
  const [query,setQuery]=useState('');

  async function load(){
    setLoading(true);
    setError('');
    try{
      const data=await loadHomeData(householdId);
      setRows(data.transactions);
    }catch{
      setError('Não conseguimos carregar seus movimentos agora.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void load();},[householdId]);

  const summary=useMemo(()=>({
    income:rows.filter(x=>x.direction==='income'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    cashExpense:rows.filter(x=>x.direction==='expense'&&x.source!=='credit_card_invoice'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    card:rows.filter(x=>x.source==='credit_card_invoice'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    transfers:rows.filter(x=>x.direction==='transfer'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0)
  }),[rows]);

  const visible=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('pt-BR');
    return rows.filter(row=>matchesFilter(row,filter)&&(!q||row.description.toLocaleLowerCase('pt-BR').includes(q)));
  },[rows,filter,query]);

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

    <section className="area-hero">
      <span>Seu histórico</span>
      <h1>Tudo que aconteceu com seu dinheiro.</h1>
      <p>O NestBalance separa o que você recebeu, o que pagou, o que foi para o cartão e o que só mudou de uma conta sua para outra.</p>
    </section>

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
                <span>{label(row)}{row.observedOn?' · '+date.format(new Date(row.observedOn+'T12:00:00')):''}</span>
                {row.installment&&<small>Parcela {row.installment.current} de {row.installment.total}</small>}
              </div>
              <b className={row.direction==='income'?'positive':''}>{row.source==='credit_card_invoice'?'•':row.direction==='income'?'+':row.direction==='transfer'?'↔':'−'} {money.format(row.amountMinor/100)}</b>
            </article>)}
          </section>}

    <AppNav canContribute={role!=='read_only'}/>
  </main>;
}
