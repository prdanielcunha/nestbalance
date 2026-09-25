'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProductTopbar } from '@/src/features/navigation/product-topbar';
import type { HouseholdRole } from '@/src/core/household';
import { loadHomeData, type HomeRow } from '@/src/lib/repositories/home';
import { ScopeViewSwitch, inFinancialView, useFinancialView } from '@/src/features/privacy/scope-view-switch';
import { SPENDING_CATEGORIES, categoryLabel, deriveRecurringCandidates, recurringPatternKey, resolvedSpendingCategory, type SpendingCategory } from '@/src/core/insights';
import { useI18n } from '@/src/i18n/locale-provider';
import { useHouseholdRevisionRefresh } from '@/src/features/realtime/use-household-revision';
import { confirmRecurringSuggestion, dismissRecurringSuggestion } from '@/src/lib/repositories/recurrences';
import { updateTransactionCategory } from '@/src/lib/repositories/categories';


type Filter='all'|'income'|'cash_expense'|'card'|'transfer';
type ViewScope='household'|'personal';

function label(row:HomeRow,locale:'pt-BR'|'en'|'es'){
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  if(row.source==='credit_card_invoice') return l('Compra no cartão','Card purchase','Compra con tarjeta');
  if(row.source==='credit_card_invoice_payment') return l('Fatura paga','Statement paid','Tarjeta pagada');
  if(row.direction==='income') return l('Dinheiro que entrou','Money in','Dinero que entró');
  if(row.direction==='transfer') return l('Só mudou de conta','Moved between your accounts','Solo cambió de cuenta');
  return l('Dinheiro que saiu','Money out','Dinero que salió');
}

function matchesFilter(row:HomeRow,filter:Filter){
  if(filter==='all') return true;
  if(filter==='income') return row.direction==='income';
  if(filter==='transfer') return row.direction==='transfer';
  if(filter==='card') return row.source==='credit_card_invoice';
  return row.direction==='expense'&&row.source!=='credit_card_invoice';
}

export function MovementsScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {t,locale,intlLocale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const date=useMemo(()=>new Intl.DateTimeFormat(intlLocale,{day:'2-digit',month:'short',year:'numeric'}),[intlLocale]);
  const [rows,setRows]=useState<HomeRow[]>([]);
  const [commitments,setCommitments]=useState<HomeRow[]>([]);
  const [dismissedRecurrenceKeys,setDismissedRecurrenceKeys]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState<Filter>('all');
  const [query,setQuery]=useState('');
  const [view,setView]=useFinancialView();
  const [recurrenceWorking,setRecurrenceWorking]=useState('');
  const [recurrenceError,setRecurrenceError]=useState('');
  const [categoryEditingId,setCategoryEditingId]=useState('');
  const [categoryDraft,setCategoryDraft]=useState<SpendingCategory>('other');
  const [categoryRemember,setCategoryRemember]=useState(false);
  const [categoryWorking,setCategoryWorking]=useState('');
  const [categoryError,setCategoryError]=useState('');

  async function load(silent=false){
    if(!silent) setLoading(true);
    setError('');
    try{
      const data=await loadHomeData(householdId);
      setRows(data.transactions);
      setCommitments(data.commitments||[]);
      setDismissedRecurrenceKeys(data.dismissedRecurrenceKeys||[]);
    }catch{
      setError(l('Não conseguimos carregar seus movimentos agora.','We could not load your activity right now.','No pudimos cargar tus movimientos ahora.'));
    }finally{
      if(!silent) setLoading(false);
    }
  }

  useHouseholdRevisionRefresh(householdId,()=>load(true));

  useEffect(()=>{
    void load();
    const onFocus=()=>void load(true);
    const onVisibility=()=>{if(document.visibilityState==='visible') void load(true);};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    return ()=>{window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);};
  },[householdId]);

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
        ? l('Não conseguimos criar a conta mensal agora. Nada foi alterado.','We could not create the monthly bill right now. Nothing changed.','No pudimos crear la cuenta mensual ahora. No se cambió nada.')
        : l('Não conseguimos guardar sua preferência agora.','We could not save your preference right now.','No pudimos guardar tu preferencia ahora.'));
    }finally{
      setRecurrenceWorking('');
    }
  }
  function beginCategoryEdit(row:HomeRow){
    if(role==='read_only') return;
    setCategoryEditingId(row.id);
    setCategoryDraft(resolvedSpendingCategory(row));
    setCategoryRemember(false);
    setCategoryError('');
  }

  async function saveCategory(row:HomeRow){
    if(role==='read_only'||categoryWorking) return;
    setCategoryWorking(row.id);
    setCategoryError('');
    try{
      await updateTransactionCategory({
        householdId,
        transactionId:row.id,
        category:categoryDraft,
        rememberForSimilar:categoryRemember
      });
      await load(true);
      setCategoryEditingId('');
      setCategoryRemember(false);
    }catch{
      setCategoryError(l(
        'Não conseguimos guardar essa categoria agora. Nada foi alterado.',
        'We could not save this category right now. Nothing changed.',
        'No pudimos guardar esta categoría ahora. No se cambió nada.'
      ));
    }finally{
      setCategoryWorking('');
    }
  }

  const summary=useMemo(()=>({
    income:scopedRows.filter(x=>x.direction==='income'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    cashExpense:scopedRows.filter(x=>x.direction==='expense'&&x.source!=='credit_card_invoice'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    card:scopedRows.filter(x=>x.source==='credit_card_invoice'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0),
    transfers:scopedRows.filter(x=>x.direction==='transfer'&&x.status!=='cancelled').reduce((s,x)=>s+x.amountMinor,0)
  }),[scopedRows]);

  const visible=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase(intlLocale);
    return scopedRows.filter(row=>matchesFilter(row,filter)&&(!q||row.description.toLocaleLowerCase(intlLocale).includes(q)));
  },[scopedRows,filter,query,intlLocale]);

  const filters:{value:Filter;label:string}[]=[
    {value:'all',label:l('Todos','All','Todos')},
    {value:'income',label:l('Recebi','Money in','Recibí')},
    {value:'cash_expense',label:l('Paguei','Paid','Pagué')},
    {value:'card',label:l('Cartão','Card','Tarjeta')},
    {value:'transfer',label:l('Entre contas','Between accounts','Entre cuentas')}
  ];

  return <main className="app-shell movements-shell">
    <ProductTopbar section={t.navMovements}/>
    <ScopeViewSwitch value={view} onChange={setView}/>

    <section className="area-hero">
      <span>{l('Seu histórico','Your history','Tu historial')}</span>
      <h1>{t.movementsTitle}</h1>
      <p>{t.movementsIntro}</p>
    </section>

    {recurringCandidates.length>0&&<section className="recurrence-suggestions" aria-labelledby="recurrence-title">
      <div className="section-title">
        <div>
          <span className="section-kicker">{l('Padrões que percebemos','Patterns we noticed','Patrones que notamos')}</span>
          <h2 id="recurrence-title">{l('Isso parece acontecer todo mês?','Does this happen every month?','¿Esto ocurre todos los meses?')}</h2>
        </div>
        <small>{l('Nada é criado sem você confirmar.','Nothing is created until you confirm it.','Nada se crea hasta que lo confirmes.')}</small>
      </div>
      <div className="recurrence-suggestion-list">
        {recurringCandidates.map(candidate=><article key={candidate.scope+'-'+candidate.key} className="recurrence-suggestion-card">
          <div>
            <span>{candidate.scope==='personal'?t.scopePersonal:t.scopeHousehold} · {l(`apareceu em ${candidate.observedMonths} meses`,`seen in ${candidate.observedMonths} months`,`apareció en ${candidate.observedMonths} meses`)}</span>
            <strong>{candidate.description}</strong>
            <p>{l(`Cerca de ${formatMoney(candidate.averageMinor)} por mês${candidate.suggestedDueDay?' · normalmente perto do dia '+candidate.suggestedDueDay:''}.`,`About ${formatMoney(candidate.averageMinor)} per month${candidate.suggestedDueDay?' · usually near day '+candidate.suggestedDueDay:''}.`,`Cerca de ${formatMoney(candidate.averageMinor)} al mes${candidate.suggestedDueDay?' · normalmente cerca del día '+candidate.suggestedDueDay:''}.`)}</p>
          </div>
          {role!=='read_only'
            ? <div className="recurrence-actions">
                <button type="button" disabled={Boolean(recurrenceWorking)} onClick={()=>void handleRecurrence(candidate.referenceTransactionId,'confirm')}>
                  {recurrenceWorking===candidate.referenceTransactionId?l('Salvando…','Saving…','Guardando…'):l('É mensal','It is monthly','Es mensual')}
                </button>
                <button type="button" className="secondary" disabled={Boolean(recurrenceWorking)} onClick={()=>void handleRecurrence(candidate.referenceTransactionId,'dismiss')}>
                  {l('Não sugerir','Do not suggest','No sugerir')}
                </button>
              </div>
            : <span className="role-pill">{t.readOnly}</span>}
        </article>)}
      </div>
      {recurrenceError&&<p className="error-copy" role="alert">{recurrenceError}</p>}
    </section>}

    <section className="movement-summary-grid">
      <article><span>{l('Recebi','Money in','Recibí')}</span><strong>{formatMoney(summary.income)}</strong></article>
      <article><span>{l('Paguei','Paid','Pagué')}</span><strong>{formatMoney(summary.cashExpense)}</strong></article>
      <article><span>{l('No cartão','On card','En tarjeta')}</span><strong>{formatMoney(summary.card)}</strong></article>
      <article><span>{l('Entre contas','Between accounts','Entre cuentas')}</span><strong>{formatMoney(summary.transfers)}</strong></article>
    </section>

    <section className="movement-controls">
      <div className="movement-filter-row">
        {filters.map(item=><button key={item.value} className={filter===item.value?'active':''} onClick={()=>setFilter(item.value)}>{item.label}</button>)}
      </div>
      <input className="premium-input movement-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={l('Buscar por descrição','Search by description','Buscar por descripción')}/>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {loading
      ? <div className="movement-full-list">{[0,1,2,3].map(i=><div className="movement-full-row skeleton-line" key={i}/>)}</div>
      : visible.length===0
        ? <section className="empty-state empty-state-action">
            <div>
              <h3>{l('Nada por aqui.','Nothing here.','Nada por aquí.')}</h3>
              <p>{query?l('Tente outra busca ou filtro.','Try another search or filter.','Prueba otra búsqueda o filtro.'):l('Conte o que aconteceu do seu jeito. Texto, áudio, print ou arquivo entram pelo mesmo lugar.','Tell us what happened in your own way. Text, audio, screenshot, or file all use the same entry point.','Cuenta lo que pasó a tu manera. Texto, audio, captura o archivo entran por el mismo lugar.')}</p>
            </div>
            {!query&&role!=='read_only'&&<Link className="primary-button" href="/add?return=/movements">{l('Adicionar movimento','Add activity','Agregar movimiento')}</Link>}
          </section>
        : <section className="movement-full-list">
            {visible.map(row=><article className="movement-full-row" key={row.id}>
              <div className={'movement-dot '+(row.direction==='income'?'in':'')}/>
              <div className="movement-full-copy">
                <strong>{row.description}</strong>
                <span>{label(row,locale)}{row.scope==='personal'?` · ${t.scopePersonal}`:''}{row.observedOn?' · '+date.format(new Date(row.observedOn+'T12:00:00')):''}</span>
                {row.direction==='expense'&&row.source!=='credit_card_invoice_payment'&&<>
                  <div className="movement-category-stack">
                    {role==='read_only'
                      ? <small className="movement-category-label">{categoryLabel(resolvedSpendingCategory(row),locale)}</small>
                      : <button className="movement-category-pill" type="button" onClick={()=>beginCategoryEdit(row)}>
                          {categoryLabel(resolvedSpendingCategory(row),locale)}
                        </button>}
                    <small className="movement-category-source">
                      {row.categorySource==='user'
                        ? l('Você definiu esta categoria.','You set this category.','Tú definiste esta categoría.')
                        : row.categorySource==='learned'
                          ? l('Aprendido com um lançamento parecido.','Learned from a similar entry.','Aprendido de un movimiento parecido.')
                          : l('Sugestão automática pelo texto.','Automatic suggestion from the description.','Sugerencia automática por el texto.')}
                    </small>
                  </div>
                  {categoryEditingId===row.id&&<div className="movement-category-editor">
                    <label>
                      <span>{l('Categoria','Category','Categoría')}</span>
                      <select className="premium-input" value={categoryDraft} onChange={event=>setCategoryDraft(event.target.value as SpendingCategory)}>
                        {SPENDING_CATEGORIES.map(category=><option key={category} value={category}>{categoryLabel(category,locale)}</option>)}
                      </select>
                    </label>
                    <label className="movement-category-remember">
                      <input type="checkbox" checked={categoryRemember} onChange={event=>setCategoryRemember(event.target.checked)}/>
                      <span>{l(
                        'Usar também em lançamentos parecidos deste Lar.',
                        'Also use this for similar entries in this household.',
                        'Usar también en movimientos parecidos de este Hogar.'
                      )}</span>
                    </label>
                    <div className="movement-category-actions">
                      <button type="button" disabled={categoryWorking===row.id} onClick={()=>void saveCategory(row)}>
                        {categoryWorking===row.id?l('Salvando…','Saving…','Guardando…'):l('Salvar','Save','Guardar')}
                      </button>
                      <button type="button" className="secondary" disabled={categoryWorking===row.id} onClick={()=>{setCategoryEditingId('');setCategoryError('');}}>
                        {l('Cancelar','Cancel','Cancelar')}
                      </button>
                    </div>
                    {categoryError&&<p className="error-copy" role="alert">{categoryError}</p>}
                  </div>}
                </>}
                {row.installment&&<small>{l(`Parcela ${row.installment.current} de ${row.installment.total}`,`Installment ${row.installment.current} of ${row.installment.total}`,`Cuota ${row.installment.current} de ${row.installment.total}`)}</small>}
              </div>
              <b className={row.direction==='income'?'positive':''}>{row.source==='credit_card_invoice'?'•':row.direction==='income'?'+':row.direction==='transfer'?'↔':'−'} {formatMoney(row.amountMinor)}</b>
            </article>)}
          </section>}
  </main>;
}
