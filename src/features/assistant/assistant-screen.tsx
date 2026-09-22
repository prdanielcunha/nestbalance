'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { askFinanceAssistant, type AssistantAnswerResponse } from '@/src/lib/repositories/assistant';
import { AppNav } from '@/src/features/navigation/app-nav';
import type { HouseholdRole } from '@/src/core/household';
import { ScopeViewSwitch, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { useAppLocale } from '@/src/i18n/locale-provider';
import { assistantSuggestions } from '@/src/core/assistant-copy';

const copy={
  'pt-BR':{
    title:'Assistente',householdAccess:'Lar e acessos',
    kicker:'Seu dinheiro, explicado com os seus dados',headline:'Pergunte sem precisar montar conta nenhuma.',
    household:'O Assistente usa somente os dados compartilhados do Lar.',personal:'O Assistente usa somente os seus itens Pessoais.',all:'O Assistente combina o Lar com os seus itens Pessoais, sem incluir dados pessoais de outras pessoas.',
    truth:'Quando não souber, ele diz que não sabe.',placeholder:'Ex.: quanto ainda falta pagar?',asking:'Consultando…',ask:'Perguntar',
    loadError:'Não conseguimos consultar seus dados agora.',
    unsupported:'AINDA NÃO SEI RESPONDER',simulation:'SIMULAÇÃO COM PREMISSAS',comparison:'COMPARAÇÃO EXPLICADA',anomalies:'SINAIS PARA CONFERIR',projection:'PROJEÇÃO COM DADOS',grounded:'RESPOSTA COMPROVADA',
    householdSources:'FONTES DO LAR',personalSources:'FONTES PESSOAIS',allSources:'FONTES DA SUA VISÃO',
    records:(n:number)=>`${n} registro${n===1?'':'s'} usado${n===1?'':'s'}`,
    updated:(value:string)=>`Atualizado às ${value}`,sourceSum:'Soma das fontes exibidas',
    also:'Você também pode perguntar',trustTitle:'Sem chute financeiro.',
    trust:'Essa camada calcula com os seus próprios registros. Comparações e alertas usam regras locais e explicáveis; um sinal de valor diferente ou duplicidade é convite para conferir, não acusação.'
  },
  en:{
    title:'Assistant',householdAccess:'Household & access',
    kicker:'Your money, explained with your own data',headline:'Ask without building the calculation yourself.',
    household:'The Assistant uses only data shared with the Household.',personal:'The Assistant uses only your Personal items.',all:'The Assistant combines Household data with your Personal items, without including other people’s private data.',
    truth:'When it does not know, it says so.',placeholder:'E.g. how much is left to pay?',asking:'Checking…',ask:'Ask',
    loadError:'We could not check your data right now.',
    unsupported:'I CANNOT ANSWER THAT YET',simulation:'SIMULATION WITH ASSUMPTIONS',comparison:'EXPLAINED COMPARISON',anomalies:'SIGNALS TO CHECK',projection:'DATA-BASED FORECAST',grounded:'GROUNDED ANSWER',
    householdSources:'HOUSEHOLD SOURCES',personalSources:'PERSONAL SOURCES',allSources:'SOURCES IN YOUR VIEW',
    records:(n:number)=>`${n} record${n===1?'':'s'} used`,
    updated:(value:string)=>`Updated at ${value}`,sourceSum:'Sum of displayed sources',
    also:'You can also ask',trustTitle:'No financial guessing.',
    trust:'This layer calculates from your own records. Comparisons and alerts use local, explainable rules; a different amount or duplicate signal is an invitation to check, not an accusation.'
  },
  es:{
    title:'Asistente',householdAccess:'Hogar y accesos',
    kicker:'Tu dinero, explicado con tus propios datos',headline:'Pregunta sin tener que hacer las cuentas.',
    household:'El Asistente usa solo los datos compartidos del Hogar.',personal:'El Asistente usa solo tus elementos Personales.',all:'El Asistente combina el Hogar con tus elementos Personales, sin incluir datos privados de otras personas.',
    truth:'Cuando no sabe, lo dice.',placeholder:'Ej.: ¿cuánto falta pagar?',asking:'Consultando…',ask:'Preguntar',
    loadError:'No pudimos consultar tus datos ahora.',
    unsupported:'TODAVÍA NO SÉ RESPONDER',simulation:'SIMULACIÓN CON SUPUESTOS',comparison:'COMPARACIÓN EXPLICADA',anomalies:'SEÑALES PARA REVISAR',projection:'PREVISIÓN CON DATOS',grounded:'RESPUESTA COMPROBABLE',
    householdSources:'FUENTES DEL HOGAR',personalSources:'FUENTES PERSONALES',allSources:'FUENTES DE TU VISIÓN',
    records:(n:number)=>`${n} registro${n===1?'':'s'} usado${n===1?'':'s'}`,
    updated:(value:string)=>`Actualizado a las ${value}`,sourceSum:'Suma de las fuentes mostradas',
    also:'También puedes preguntar',trustTitle:'Sin adivinanzas financieras.',
    trust:'Esta capa calcula con tus propios registros. Las comparaciones y alertas usan reglas locales y explicables; una señal de valor diferente o duplicado es una invitación a revisar, no una acusación.'
  }
} as const;

export function AssistantScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {locale,money}=useAppLocale();
  const c=copy[locale];
  const starterCopy=assistantSuggestions(locale);
  const starters=[starterCopy.change,starterCopy.anomalies,starterCopy.spend,starterCopy.ending,starterCopy.remaining,starterCopy.available,starterCopy.future];
  const time=useMemo(()=>new Intl.DateTimeFormat(locale==='en'?'en-US':locale,{hour:'2-digit',minute:'2-digit'}),[locale]);
  const [question,setQuestion]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<AssistantAnswerResponse|null>(null);
  const [view,setView]=useState<FinancialView>('household');

  const sourceTotal=useMemo(()=>result?.answer.sources.reduce((sum,item)=>sum+item.amountMinor,0)??0,[result]);

  async function ask(value?:string){
    const text=(value??question).trim();
    if(!text||loading) return;
    setQuestion(text);
    setLoading(true);
    setError('');
    try{
      const response=await askFinanceAssistant(householdId,text,view,locale);
      setResult(response);
    }catch{
      setError(c.loadError);
    }finally{
      setLoading(false);
    }
  }

  const answerBadge=result?.answer.intent==='unsupported'
    ?c.unsupported
    :result?.answer.intent==='spending_simulation'
      ?c.simulation
      :result?.answer.intent==='spending_change'
        ?c.comparison
        :result?.answer.intent==='anomalies'
          ?c.anomalies
          :result?.answer.intent==='future_months'||result?.answer.intent==='ending_installments'
            ?c.projection
            :c.grounded;

  return <main className="app-shell assistant-shell">
    <header className="topbar">
      <div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">{c.title}</span></div>
      <Link href="/household" className="avatar-dot" aria-label={c.householdAccess} />
    </header>
    <ScopeViewSwitch value={view} onChange={next=>{setView(next);setResult(null);setError('');}}/>

    <section className="assistant-hero">
      <div className="assistant-orb" aria-hidden="true"><span/></div>
      <span>{c.kicker}</span>
      <h1>{c.headline}</h1>
      <p>{view==='household'?c.household:view==='personal'?c.personal:c.all} {c.truth}</p>

      <div className="assistant-composer">
        <textarea
          value={question}
          onChange={e=>setQuestion(e.target.value)}
          placeholder={c.placeholder}
          maxLength={400}
          rows={3}
          onKeyDown={e=>{
            if(e.key==='Enter'&&!e.shiftKey){
              e.preventDefault();
              void ask();
            }
          }}
        />
        <div>
          <span>{question.length}/400</span>
          <button className="primary-button" disabled={loading||!question.trim()} onClick={()=>void ask()}>
            {loading?c.asking:c.ask}
          </button>
        </div>
      </div>

      {!result&&<div className="assistant-starters">
        {starters.map(value=><button key={value} type="button" onClick={()=>void ask(value)}>{value}</button>)}
      </div>}
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}

    {result&&<section className="assistant-answer" aria-live="polite">
      <div className="assistant-answer-head">
        <div>
          <span>{answerBadge}</span>
          <h2>{result.answer.title}</h2>
          <p>{result.answer.summary}</p>
        </div>
        {result.answer.answerMinor!==null&&<strong className="assistant-answer-amount">{money.format(result.answer.answerMinor/100)}</strong>}
      </div>

      {result.answer.cards.length>0&&<div className="assistant-card-grid">
        {result.answer.cards.map((card,index)=><article key={`${card.label}-${index}`}>
          <span>{card.label}</span><strong>{money.format(card.amountMinor/100)}</strong><small>{card.detail}</small>
        </article>)}
      </div>}

      {result.answer.sources.length>0&&<div className="assistant-sources">
        <div className="assistant-sources-title">
          <div>
            <span>{view==='household'?c.householdSources:view==='personal'?c.personalSources:c.allSources}</span>
            <strong>{c.records(result.answer.sources.length)}</strong>
          </div>
          <small>{c.updated(time.format(new Date(result.asOf)))}</small>
        </div>
        <div className="assistant-source-list">
          {result.answer.sources.map(source=><article key={`${source.kind}-${source.id}`}>
            <div><strong>{source.label}</strong><span>{source.detail}</span></div>
            <b>{money.format(source.amountMinor/100)}</b>
          </article>)}
        </div>
        {(result.answer.intent==='remaining_to_pay'||result.answer.intent==='available_now')&&<div className="assistant-source-foot">
          <span>{c.sourceSum}</span><strong>{money.format(sourceTotal/100)}</strong>
        </div>}
      </div>}

      <div className="assistant-next-questions">
        <span>{c.also}</span>
        <div>{result.answer.suggestions.map(value=><button key={value} type="button" onClick={()=>void ask(value)}>{value}</button>)}</div>
      </div>
    </section>}

    <section className="assistant-trust-note">
      <strong>{c.trustTitle}</strong><p>{c.trust}</p>
    </section>

    <AppNav canContribute={role!=='read_only'}/>
  </main>;
}
