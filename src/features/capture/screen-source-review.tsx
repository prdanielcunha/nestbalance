'use client';
import {useEffect,useMemo,useState} from 'react';
import type {AiFinancialScreenSnapshot} from '@/src/core/ai-financial';
import {screenChangeKind,screenSourceCandidates,validObservationDate,type ScreenDecision,type ScreenReview,type ScreenSource} from '@/src/core/screen-reconciliation';
import {normalizeSavingsPotName} from '@/src/core/savings-pots';
import {parseMoneyInputToMinor} from '@/src/core/accounts';
import {loadHomeData,type HomeAccount,type HomeSavingsPot} from '@/src/lib/repositories/home';
import {useI18n} from '@/src/i18n/locale-provider';

export function ScreenSourceReview({householdId,uid,scope,screen,onReady}:{householdId:string;uid:string;scope:'personal'|'household';screen:AiFinancialScreenSnapshot;onReady:(review:ScreenReview|null)=>void}){
  const {locale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [data,setData]=useState<{accounts:HomeAccount[];pots:HomeSavingsPot[]}|null>(null);
  const [error,setError]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [observedOn,setObservedOn]=useState('');
  const [overrides,setOverrides]=useState<Record<string,ScreenDecision>>({});
  const today=new Date(Date.now()-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,10);
  useEffect(()=>{
    let cancelled=false;setData(null);setError(false);setOverrides({});
    void loadHomeData(householdId).then(d=>{if(!cancelled)setData({accounts:d.accounts,pots:d.savingsPots||[]});}).catch(()=>{if(!cancelled)setError(true);});
    return ()=>{cancelled=true;};
  },[householdId,scope,refresh]);
  const rows=useMemo(()=>{
    const result:Array<{key:string;kind:'accounts'|'pots';item:AiFinancialScreenSnapshot['pots'][number]|AiFinancialScreenSnapshot['accounts'][number];choice:ScreenDecision;sources:ScreenSource[];existing?:ScreenSource;ambiguous:boolean}>=[];
    for(const kind of ['accounts','pots'] as const) screen[kind].forEach((item,index)=>{
      const sources:ScreenSource[]=(data?.[kind]||[]).filter(s=>(s.scope||'household')===scope&&s.currency===item.currency&&(!s.institutionName||normalizeSavingsPotName(s.institutionName)===normalizeSavingsPotName(screen.institution||'')));
      const matches=screenSourceCandidates(sources,{name:item.name,institution:screen.institution,currency:item.currency,scope,ownerUid:uid,last4:'last4' in item?item.last4:null});
      const key=kind+':'+index;
      const repeatedLabel=screen[kind].filter(other=>normalizeSavingsPotName(other.name)===normalizeSavingsPotName(item.name)).length>1;
      const target=matches.length===1&&!repeatedLabel?matches[0]:undefined;
      const choice=overrides[key]|| (target?{targetId:target.id,expectedUpdatedAtMs:target.updatedAtMs??null,expectedBalanceMinor:target.balanceMinor,sourceAccountLabel:target.sourceAccountLabel||'',balanceCoverage:target.balanceCoverage,includedSavingsMinor:target.includedSavingsMinor}:{createNew:matches.length===0&&!repeatedLabel});
      result.push({key,kind,item,choice,sources,existing:sources.find(s=>s.id===choice.targetId),ambiguous:(matches.length>1||repeatedLabel)&&!choice.targetId&&!choice.createNew});
    });
    return result;
  },[data,screen,scope,uid,overrides]);
  // Pin the original match: editing a label must not turn an update into a
  // creation. Removing rows remounts this review with a fresh correspondence map.
  useEffect(()=>{
    if(!data) return;
    setOverrides(current=>{
      let changed=false;const next={...current};
      for(const row of rows) if(!(row.key in next)){next[row.key]=row.choice;changed=true;}
      return changed?next:current;
    });
  },[data,rows]);
  const review=useMemo<ScreenReview|null>(()=>{
    if(!data||!validObservationDate(observedOn)||observedOn>today||rows.some(r=>r.ambiguous||(!r.choice.targetId&&!r.choice.createNew)||(r.choice.balanceCoverage==='includes_pots'&&(!Number.isSafeInteger(r.choice.includedSavingsMinor)||r.choice.includedSavingsMinor!>r.item.balanceMinor)))) return null;
    if(new Set(rows.filter(r=>r.choice.targetId).map(r=>r.kind+':'+r.choice.targetId)).size!==rows.filter(r=>r.choice.targetId).length) return null;
    if(rows.some(r=>r.existing?.observedOn&&observedOn<r.existing.observedOn)) return null;
    return {observedOn,accounts:rows.filter(r=>r.kind==='accounts').map(r=>r.choice),pots:rows.filter(r=>r.kind==='pots').map(r=>r.choice)};
  },[data,observedOn,rows,today]);
  useEffect(()=>{onReady(review);return ()=>onReady(null);},[review,onReady]);
  function update(key:string,current:ScreenDecision,patch:Partial<ScreenDecision>){setOverrides(o=>({...o,[key]:{...current,...patch}}));}
  const counts=rows.reduce((c,r)=>{c[screenChangeKind(r.existing,r.item.balanceMinor,'goalMinor' in r.item?r.item.goalMinor:null,'targetDate' in r.item?r.item.targetDate:null)]++;return c;},{create:0,update:0,unchanged:0});
  return <section className="screen-reconciliation" aria-label={l('Comparar com seus dados','Compare with your data','Comparar con tus datos')}>
    <h3>{l('O que este print vai mudar','What this screenshot will change','Qué cambiará esta captura')}</h3>
    <p>{l('Comparamos com seus registros. O mesmo nome em outro banco continua separado.','We compare with your records. The same name at another bank stays separate.','Comparamos con tus registros. El mismo nombre en otro banco sigue separado.')}</p>
    {!data&&!error&&<p role="status">{l('Comparando com seus dados…','Comparing with your data…','Comparando con tus datos…')}</p>}
    {error&&<p role="alert">{l('Não conseguimos carregar os registros. Tente comparar novamente.','Could not load records. Try comparing again.','No pudimos cargar registros. Intenta comparar otra vez.')}</p>}
    <button type="button" className="text-button" onClick={()=>setRefresh(v=>v+1)}>{l('Comparar novamente','Compare again','Comparar de nuevo')}</button>
    <label>{l('De quando são os dados deste print?','When are the data in this screenshot from?','¿De cuándo son los datos de esta captura?')}<input type="date" max={today} value={observedOn} onChange={e=>setObservedOn(e.target.value)}/></label>
    <button className="text-button" type="button" onClick={()=>setObservedOn(today)}>{l('Acabei de tirar este print','I just took this screenshot','Acabo de tomar esta captura')}</button>
    {data&&<>
      <p role="status">{l(`${counts.update} para atualizar · ${counts.create} para adicionar · ${counts.unchanged} sem alteração`,`${counts.update} to update · ${counts.create} to add · ${counts.unchanged} unchanged`,`${counts.update} para actualizar · ${counts.create} para agregar · ${counts.unchanged} sin cambios`)}</p>
      <div className="screen-reconciliation-list">{rows.map(r=><article key={r.key} className={r.ambiguous?'needs-choice':''}>
        <b>{r.item.name}</b>
        <strong>{r.existing?`${(r.existing.balanceMinor===null?'—':formatMoney(r.existing.balanceMinor))} → `:''}{formatMoney(r.item.balanceMinor)}</strong>
        <span>{r.ambiguous?l('Qual registro corresponde a este cofrinho ou conta?','Which record matches this savings pot or account?','¿Qué registro corresponde a esta alcancía o cuenta?'):r.existing?screenChangeKind(r.existing,r.item.balanceMinor,'goalMinor' in r.item?r.item.goalMinor:null,'targetDate' in r.item?r.item.targetDate:null)==='unchanged'?l('Sem alteração de valor ou meta · vincular evidência','Amount and goal unchanged · link evidence','Sin cambios de valor o meta · vincular evidencia'):l('Atualizar registro existente','Update existing record','Actualizar registro existente'):l('Adicionar um registro separado','Add a separate record','Agregar un registro separado')}</span>
        <label>{l('Organizar como','Organize as','Organizar como')}<select value={r.choice.targetId||(r.choice.createNew?'new':'')} onChange={e=>{
          const s=r.sources.find(s=>s.id===e.target.value);
          update(r.key,r.choice,{targetId:s?.id||null,createNew:e.target.value==='new',expectedUpdatedAtMs:s?.updatedAtMs??null,expectedBalanceMinor:s?.balanceMinor??null,sourceAccountLabel:s?.sourceAccountLabel||'',balanceCoverage:s?.balanceCoverage,includedSavingsMinor:s?.includedSavingsMinor});
        }}><option value="" disabled>{l('Escolha uma correspondência','Choose a match','Elige una correspondencia')}</option><option value="new">{l('É outro: adicionar separado','Another one: add separately','Es otro: agregar separado')}</option>{r.sources.map(s=><option key={s.id} value={s.id}>{s.name} · {s.sourceAccountLabel||s.last4||s.id.slice(-6)} · {(s.balanceMinor===null?'—':formatMoney(s.balanceMinor))}</option>)}</select></label>
        <label>{l('Identificação da conta ou titular (opcional)','Account or holder label (optional)','Identificación de cuenta o titular (opcional)')}<input maxLength={80} value={r.choice.sourceAccountLabel||''} placeholder={l('Ex.: Daniel · conta final 1234','E.g. Daniel · account ending 1234','Ej.: Daniel · cuenta final 1234')} onChange={e=>update(r.key,r.choice,{sourceAccountLabel:e.target.value})}/></label>
        {r.kind==='accounts'&&<>
          <label>{l('Este saldo inclui os cofrinhos?','Does this balance include savings pots?','¿Este saldo incluye alcancías?')}<select value={r.choice.balanceCoverage||'unknown'} onChange={e=>update(r.key,r.choice,{balanceCoverage:e.target.value as ScreenDecision['balanceCoverage'],includedSavingsMinor:null})}><option value="unknown">{l('Não sei: conferir depois','Not sure: review later','No sé: revisar después')}</option><option value="excludes_pots">{l('Não, está sem cofrinhos','No, it excludes them','No, los excluye')}</option><option value="includes_pots">{l('Sim, inclui dinheiro guardado','Yes, it includes savings','Sí, incluye dinero guardado')}</option></select></label>
          {r.choice.balanceCoverage==='includes_pots'&&<label>{l('Valor dos cofrinhos incluído neste saldo','Savings amount included in this balance','Importe de alcancías incluido en este saldo')}<input inputMode="decimal" onChange={e=>update(r.key,r.choice,{includedSavingsMinor:parseMoneyInputToMinor(e.target.value,locale)})}/></label>}
        </>}
        {r.kind==='pots'&&<label>{l('Objetivo consolidado (opcional)','Consolidated goal (optional)','Objetivo consolidado (opcional)')}<select value={r.choice.goalGroupId===undefined?r.existing?.goalGroupId||'':r.choice.goalGroupId||''} onChange={e=>update(r.key,r.choice,{goalGroupId:e.target.value||null})}><option value="">{l('Manter como objetivo separado','Keep as a separate goal','Mantener como objetivo separado')}</option>{(data.pots||[]).filter(p=>p.id!==r.choice.targetId&&(p.scope||'household')===scope&&p.currency===r.item.currency).map(p=><option key={p.id} value={p.goalGroupId||p.id}>{p.name} · {p.institutionName||'NestBalance'}</option>)}</select></label>}
        {r.existing?.observedOn&&observedOn<r.existing.observedOn&&<p role="alert" className="error-copy">{l('Este print é anterior ao saldo salvo. Ele não pode substituir o mais recente.','This screenshot predates the saved balance and cannot replace it.','Esta captura es anterior al saldo guardado y no puede reemplazarlo.')}</p>}
      </article>)}</div>
      <small>{l('Atualizar saldo não cria receita, despesa nem transferência. O original permanece guardado.','Updating a balance creates no income, expense or transfer. The original stays preserved.','Actualizar un saldo no crea ingresos, gastos ni transferencias. El original se conserva.')}</small>
    </>}
  </section>;
}
