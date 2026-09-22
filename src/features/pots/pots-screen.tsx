'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppNav } from '@/src/features/navigation/app-nav';
import { HouseholdLink } from '@/src/features/navigation/household-link';
import type { HouseholdRole } from '@/src/core/household';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { groupSavingsPots } from '@/src/core/savings-pots';
import type { FinancialScope } from '@/src/core/privacy';
import { loadHomeData, type HomeSavingsPot } from '@/src/lib/repositories/home';
import { upsertSavingsPot } from '@/src/lib/repositories/savings-pots';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import { useI18n } from '@/src/i18n/locale-provider';

export function PotsScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {locale,intlLocale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const canContribute=role!=='read_only';

  const [pots,setPots]=useState<HomeSavingsPot[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [view,setView]=useState<FinancialView>('household');
  const [editing,setEditing]=useState<HomeSavingsPot|null>(null);
  const [creating,setCreating]=useState(false);
  const [name,setName]=useState('');
  const [balanceInput,setBalanceInput]=useState('');
  const [goalInput,setGoalInput]=useState('');
  const [institution,setInstitution]=useState('');
  const [scope,setScope]=useState<FinancialScope>('household');
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState('');

  async function load(silent=false){
    if(!silent) setLoading(true);
    setError('');
    try{
      const data=await loadHomeData(householdId);
      setPots(data.savingsPots||[]);
    }catch{
      setError(l('Não conseguimos carregar seus cofrinhos agora.','We could not load your savings pots right now.','No pudimos cargar tus alcancías ahora.'));
    }finally{
      if(!silent) setLoading(false);
    }
  }

  useEffect(()=>{
    void load();
    const onFocus=()=>void load(true);
    const onVisibility=()=>{if(document.visibilityState==='visible') void load(true);};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    return ()=>{window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);};
  },[householdId]);

  const visible=useMemo(()=>pots.filter(item=>inFinancialView(item.scope,view)),[pots,view]);
  const groups=useMemo(()=>groupSavingsPots(visible),[visible]);
  const total=useMemo(()=>groups.reduce((sum,item)=>sum+item.balanceMinor,0),[groups]);
  const institutionCount=useMemo(()=>new Set(visible.map(item=>item.institutionName||l('Manual','Manual','Manual'))).size,[visible,locale]);

  function formatInput(value:number){
    return (value/100).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
  }

  function closeEditor(){
    if(saving) return;
    setEditing(null);
    setCreating(false);
    setFormError('');
  }

  function openNew(){
    setEditing(null);
    setCreating(true);
    setName('');
    setBalanceInput('');
    setGoalInput('');
    setInstitution('');
    setScope(view==='personal'?'personal':'household');
    setFormError('');
  }

  function openEdit(item:HomeSavingsPot){
    setCreating(false);
    setEditing(item);
    setName(item.name);
    setBalanceInput(formatInput(item.balanceMinor));
    setGoalInput(item.goalMinor&&item.goalMinor>0?formatInput(item.goalMinor):'');
    setInstitution(item.institutionName||'');
    setScope(item.scope==='personal'?'personal':'household');
    setFormError('');
  }

  async function save(){
    if(saving) return;
    const cleanName=name.trim();
    if(cleanName.length<2){
      setFormError(l('Dê um nome para este cofrinho.','Give this savings pot a name.','Ponle un nombre a esta alcancía.'));
      return;
    }
    const balanceMinor=parseMoneyInputToMinor(balanceInput||'0',locale);
    if(balanceMinor===null||balanceMinor<0){
      setFormError(l('Digite um valor guardado válido.','Enter a valid saved amount.','Escribe un valor guardado válido.'));
      return;
    }
    const goalMinor=goalInput.trim()?parseMoneyInputToMinor(goalInput,locale):null;
    if(goalInput.trim()&&(goalMinor===null||goalMinor<=0)){
      setFormError(l('Digite uma meta válida ou deixe em branco.','Enter a valid goal or leave it blank.','Escribe una meta válida o déjala en blanco.'));
      return;
    }

    setSaving(true);
    setFormError('');
    try{
      await upsertSavingsPot({
        householdId,
        potId:editing?.id,
        name:cleanName,
        balanceMinor,
        goalMinor,
        institutionName:institution.trim()||null,
        scope:editing?.scope==='personal'?'personal':editing?'household':scope
      });
      setEditing(null);
      setCreating(false);
      setFormError('');
      await load();
    }catch{
      setFormError(l('Não conseguimos guardar essa alteração agora.','We could not save this change right now.','No pudimos guardar este cambio ahora.'));
    }finally{
      setSaving(false);
    }
  }

  return <main className="app-shell accounts-shell pots-shell">
    <header className="topbar">
      <div>
        <div className="eyebrow">NestBalance</div>
        <span className="topbar-subtitle">{l('Cofrinhos','Savings pots','Alcancías')}</span>
      </div>
      <div className="topbar-actions">
        <Link href="/documents" className="ghost-button">{l('Documentos','Documents','Documentos')}</Link>
        <HouseholdLink/>
      </div>
    </header>

    <ScopeViewSwitch value={view} onChange={setView}/>

    <section className="area-hero accounts-hero">
      <span>{l('Dinheiro separado por finalidade','Money set aside by purpose','Dinero separado por objetivo')}</span>
      <h1>{loading
        ? l('Organizando seus cofrinhos…','Organizing your savings pots…','Organizando tus alcancías…')
        : groups.length
          ? formatMoney(total)
          : l('Seus cofrinhos, em todos os bancos.','Your savings pots, across every bank.','Tus alcancías, en todos tus bancos.')}</h1>
      <p>{groups.length
        ? l(
            `${groups.length} objetivo${groups.length===1?'':'s'} · ${institutionCount} ${institutionCount===1?'origem':'origens'}. O total é dinheiro guardado, não dinheiro gasto.`,
            `${groups.length} goal${groups.length===1?'':'s'} · ${institutionCount} source${institutionCount===1?'':'s'}. This is saved money, not spending.`,
            `${groups.length} objetivo${groups.length===1?'':'s'} · ${institutionCount} origen${institutionCount===1?'':'es'}. Es dinero guardado, no un gasto.`
          )
        : l(
            'Mande um print dos cofrinhos do seu banco e o NestBalance organiza nomes, saldos, metas e origem sem transformar isso em despesa.',
            'Send a screenshot of your bank savings pots and NestBalance organizes names, balances, goals, and sources without turning them into expenses.',
            'Envía una captura de las alcancías de tu banco y NestBalance organiza nombres, saldos, metas y origen sin convertirlo en gasto.'
          )}</p>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}

    {canContribute&&<section>
      <div className="section-title">
        <div>
          <h2>{l('Adicionar sem cadastro chato','Add without busywork','Agregar sin formularios pesados')}</h2>
          <span>{l('print primeiro, formulário só quando você quiser','screenshot first, form only when you want it','primero captura, formulario solo cuando quieras')}</span>
        </div>
      </div>
      <div className="account-balance-grid pots-quick-grid">
        <Link href="/add?return=/pots" className="account-balance-tile pots-action-tile">
          <span>{l('Mais rápido','Fastest','Más rápido')}</span>
          <h3>{l('Importar print','Import screenshot','Importar captura')}</h3>
          <strong>{l('Banco → NestBalance','Bank → NestBalance','Banco → NestBalance')}</strong>
          <small>{l('Reconhece vários cofrinhos de uma vez e atualiza os que já existem.','Recognizes several pots at once and updates existing ones.','Reconoce varias alcancías a la vez y actualiza las que ya existen.')}</small>
        </Link>
        <button type="button" className="account-balance-tile pots-action-tile" onClick={openNew}>
          <span>{l('Manual','Manual','Manual')}</span>
          <h3>{l('Criar cofrinho','Create savings pot','Crear alcancía')}</h3>
          <strong>{l('Poucos campos','Just a few fields','Pocos campos')}</strong>
          <small>{l('Nome, quanto tem e meta. Só isso.','Name, current amount, and goal. That is it.','Nombre, cuánto hay y meta. Nada más.')}</small>
        </button>
      </div>
    </section>}

    <section className="savings-pots-section">
      <div className="section-title">
        <div>
          <h2>{l('Seus cofrinhos','Your savings pots','Tus alcancías')}</h2>
          <span>{l('mesmo objetivo em bancos diferentes aparece junto','the same goal across different banks appears together','el mismo objetivo en bancos distintos aparece junto')}</span>
        </div>
      </div>

      {loading
        ? <div className="savings-pot-grid">{[0,1,2].map(i=><div className="savings-pot-card skeleton-line" key={i}/>)}</div>
        : groups.length===0
          ? <div className="empty-state">
              <h3>{l('Ainda não há dinheiro guardado aqui.','No saved money here yet.','Todavía no hay dinero guardado aquí.')}</h3>
              <p>{l('Use um print do banco. Se ele mostrar vários cofrinhos, importamos todos de uma vez.','Use a bank screenshot. If it shows several pots, we import them all at once.','Usa una captura del banco. Si muestra varias alcancías, las importamos todas de una vez.')}</p>
            </div>
          : <div className="savings-pot-grid">
              {groups.map(group=><article className="savings-pot-card" key={group.key}>
                <span>
                  {group.sources.length===1
                    ? group.sources[0].institutionName||l('Informado manualmente','Added manually','Agregado manualmente')
                    : l(`${group.sources.length} bancos/origens`,`${group.sources.length} banks/sources`,`${group.sources.length} bancos/orígenes`)}
                  {group.scope==='personal'&&<em className="personal-pill">{l('Só eu','Only me','Solo yo')}</em>}
                </span>
                <h3>{group.name}</h3>
                <strong>{formatMoney(group.balanceMinor)}</strong>
                {group.goalMinor&&group.goalMinor>0
                  ? <>
                      <small>{l('Meta','Goal','Meta')} {formatMoney(group.goalMinor)} · {Math.round((group.progress||0)*100)}%</small>
                      <progress max={group.goalMinor} value={Math.min(group.balanceMinor,group.goalMinor)} aria-label={l('Progresso da meta','Goal progress','Progreso de la meta')}/>
                    </>
                  : <small>{l('Sem meta definida','No goal set','Sin meta definida')}</small>}
                {group.goalConflict&&<small>{l('Há metas diferentes nas origens. Mostramos a maior; confira as fontes abaixo.','Sources have different goals. We show the highest one; review sources below.','Hay metas distintas en los orígenes. Mostramos la mayor; revisa las fuentes abajo.')}</small>}

                {group.sources.map(source=><div className="account-balance-foot" key={source.id}>
                  <small>{source.institutionName||l('Manual','Manual','Manual')} · {formatMoney(source.balanceMinor)}</small>
                  {canContribute&&<button type="button" onClick={()=>openEdit(source)}>{l('Editar','Edit','Editar')}</button>}
                </div>)}
              </article>)}
            </div>}
    </section>

    <section className="empty-state">
      <h3>{l('Guardar dinheiro não é gastar dinheiro.','Saving money is not spending money.','Guardar dinero no es gastar dinero.')}</h3>
      <p>{l(
        'Quando um valor sai da sua conta e vai para um cofrinho seu, o NestBalance trata como transferência/alocação. Seu patrimônio não diminui e a despesa não é contada duas vezes.',
        'When money moves from your account into one of your own savings pots, NestBalance treats it as a transfer/allocation. Your net money does not shrink and spending is not counted twice.',
        'Cuando el dinero pasa de tu cuenta a una alcancía tuya, NestBalance lo trata como transferencia/asignación. Tu patrimonio no disminuye y el gasto no se cuenta dos veces.'
      )}</p>
    </section>

    <AppNav canContribute={canContribute}/>

    {(creating||editing)&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&closeEditor()}>
      <section className="capture-sheet balance-update-sheet" role="dialog" aria-modal="true" aria-label={creating?l('Criar cofrinho','Create savings pot','Crear alcancía'):l('Editar cofrinho','Edit savings pot','Editar alcancía')}>
        <div className="sheet-handle"/>
        <div className="eyebrow">{l('COFRINHO','SAVINGS POT','ALCANCÍA')}</div>
        <h2>{creating?l('O que você está separando?','What are you saving for?','¿Para qué estás guardando?'):editing?.name}</h2>
        <p>{l('Isso registra onde o dinheiro está guardado. Não cria renda nem despesa.','This records where the money is saved. It does not create income or an expense.','Esto registra dónde está guardado el dinero. No crea ingreso ni gasto.')}</p>

        {creating&&<ScopeChoice value={scope} onChange={setScope} disabled={saving}/>}

        <label className="field-label" htmlFor="pot-name">{l('Nome','Name','Nombre')}</label>
        <input id="pot-name" className="pot-text-input" value={name} onChange={e=>setName(e.target.value)} placeholder={l('Ex.: Aniversário Davi','E.g. Davi birthday','Ej.: Cumpleaños Davi')} maxLength={80}/>

        <label className="field-label" htmlFor="pot-balance">{l('Quanto tem agora','Saved now','Cuánto hay ahora')}</label>
        <div className="money-input-wrap"><span>R$</span><input id="pot-balance" inputMode="decimal" value={balanceInput} onChange={e=>setBalanceInput(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>

        <label className="field-label" htmlFor="pot-goal">{l('Meta (opcional)','Goal (optional)','Meta (opcional)')}</label>
        <div className="money-input-wrap"><span>R$</span><input id="pot-goal" inputMode="decimal" value={goalInput} onChange={e=>setGoalInput(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>

        <label className="field-label" htmlFor="pot-institution">{l('Onde está guardado (opcional)','Where it is saved (optional)','Dónde está guardado (opcional)')}</label>
        <input id="pot-institution" className="pot-text-input" value={institution} onChange={e=>setInstitution(e.target.value)} placeholder={l('Ex.: Mercado Pago','E.g. Mercado Pago','Ej.: Mercado Pago')} maxLength={80}/>

        {formError&&<p className="error-copy" role="alert">{formError}</p>}

        <div className="sheet-actions">
          <button className="ghost-button" disabled={saving} onClick={closeEditor}>{l('Cancelar','Cancel','Cancelar')}</button>
          <button className="primary-button" disabled={saving} onClick={()=>void save()}>{saving?l('Guardando…','Saving…','Guardando…'):l('Guardar cofrinho','Save savings pot','Guardar alcancía')}</button>
        </div>
      </section>
    </div>}
  </main>;
}
