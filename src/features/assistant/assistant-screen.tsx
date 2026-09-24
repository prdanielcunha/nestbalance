'use client';
import { useMemo, useState } from 'react';
import { askFinanceAssistant, type AssistantAnswerResponse } from '@/src/lib/repositories/assistant';
import { HouseholdLink } from '@/src/features/navigation/household-link';
import type { HouseholdRole } from '@/src/core/household';
import { ScopeViewSwitch, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { useI18n } from '@/src/i18n/locale-provider';

export function AssistantScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {t,locale,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const starters=useMemo(()=>[
    l('Por que gastei mais este mês?','Why did I spend more this month?','¿Por qué gasté más este mes?'),
    l('O que está estranho?','What looks unusual?','¿Qué se ve extraño?'),
    l(`Dá para gastar ${formatMoney(50000)}?`,`Can I spend ${formatMoney(50000)}?`,`¿Puedo gastar ${formatMoney(50000)}?`),
    l('Quais parcelas terminam logo?','Which installments end soon?','¿Qué cuotas terminan pronto?'),
    l('Quanto ainda falta pagar?','How much is still left to pay?','¿Cuánto falta pagar?'),
    l('Quanto tenho disponível?','How much do I have available?','¿Cuánto tengo disponible?'),
    l('O que já está comprometido nos próximos meses?','What is already committed in the next months?','¿Qué ya está comprometido en los próximos meses?')
  ],[locale,formatMoney]);

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
      const response=await askFinanceAssistant(householdId,text,view);
      setResult(response);
    }catch{
      setError(l('Não conseguimos consultar seus dados agora.','We could not check your data right now.','No pudimos consultar tus datos ahora.'));
    }finally{
      setLoading(false);
    }
  }

  function trustLabel(){
    if(!result) return '';
    if(result.answer.intent==='unsupported') return l('AINDA NÃO SEI RESPONDER','I CANNOT ANSWER THIS YET','TODAVÍA NO SÉ RESPONDER');
    if(result.answer.intent==='spending_simulation') return l('SIMULAÇÃO COM PREMISSAS','SIMULATION WITH ASSUMPTIONS','SIMULACIÓN CON SUPUESTOS');
    if(result.answer.intent==='spending_change') return l('COMPARAÇÃO EXPLICADA','EXPLAINED COMPARISON','COMPARACIÓN EXPLICADA');
    if(result.answer.intent==='anomalies') return l('SINAIS PARA CONFERIR','SIGNALS TO CHECK','SEÑALES PARA REVISAR');
    if(result.answer.intent==='future_months'||result.answer.intent==='ending_installments') return l('PROJEÇÃO COM DADOS','DATA-BASED FORECAST','PREVISIÓN CON DATOS');
    return l('RESPOSTA COMPROVADA','GROUNDED ANSWER','RESPUESTA COMPROBABLE');
  }

  const scopeExplanation=view==='household'
    ? l('O Assistente usa somente os dados compartilhados do Lar.','The Assistant uses only shared Household data.','El Asistente usa solo los datos compartidos del Hogar.')
    : view==='personal'
      ? l('O Assistente usa somente os seus itens Pessoais.','The Assistant uses only your private items.','El Asistente usa solo tus elementos privados.')
      : l('O Assistente combina o Lar com os seus itens Pessoais, sem incluir dados pessoais de outras pessoas.','The Assistant combines Household data with your private items, without including anyone else’s private data.','El Asistente combina los datos del Hogar con tus elementos privados, sin incluir datos privados de otras personas.');

  return <main className="app-shell assistant-shell">
    <header className="topbar">
      <div>
        <div className="eyebrow">NestBalance</div>
        <span className="topbar-subtitle">{t.navAssistant}</span>
      </div>
      <HouseholdLink/>
    </header>
    <ScopeViewSwitch value={view} onChange={next=>{setView(next);setResult(null);setError('');}}/>

    <section className="assistant-hero">
      <div className="assistant-orb" aria-hidden="true"><span/></div>
      <span>{t.assistantTagline}</span>
      <h1>{t.assistantTitle}</h1>
      <p>{scopeExplanation} {l('Quando não souber, ele diz que não sabe.','When it does not know, it says so.','Cuando no sabe, lo dice.')}</p>

      <div className="assistant-composer">
        <textarea
          value={question}
          onChange={e=>setQuestion(e.target.value)}
          placeholder={t.assistantPlaceholder}
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
            {loading?t.assistantLoading:t.assistantAsk}
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
          <span>{trustLabel()}</span>
          <h2>{result.answer.title}</h2>
          <p>{result.answer.summary}</p>
        </div>
        {result.answer.answerMinor!==null&&
          <strong className="assistant-answer-amount">{formatMoney(result.answer.answerMinor)}</strong>}
      </div>

      {result.answer.cards.length>0&&<div className="assistant-card-grid">
        {result.answer.cards.map((card,index)=><article key={`${card.label}-${index}`}>
          <span>{card.label}</span>
          <strong>{formatMoney(card.amountMinor)}</strong>
          <small>{card.detail}</small>
        </article>)}
      </div>}

      {result.answer.sources.length>0&&<div className="assistant-sources">
        <div className="assistant-sources-title">
          <div>
            <span>{view==='household'
              ?l('FONTES DO LAR','HOUSEHOLD SOURCES','FUENTES DEL HOGAR')
              :view==='personal'
                ?l('FONTES PESSOAIS','PRIVATE SOURCES','FUENTES PRIVADAS')
                :l('FONTES DA SUA VISÃO','SOURCES IN YOUR VIEW','FUENTES DE TU VISTA')}</span>
            <strong>{l(
              `${result.answer.sources.length} registro${result.answer.sources.length===1?'':'s'} usado${result.answer.sources.length===1?'':'s'}`,
              `${result.answer.sources.length} record${result.answer.sources.length===1?'':'s'} used`,
              `${result.answer.sources.length} registro${result.answer.sources.length===1?'':'s'} usado${result.answer.sources.length===1?'':'s'}`
            )}</strong>
          </div>
          <small>{l('Atualizado','Updated','Actualizado')} {formatDate(new Date(result.asOf),{hour:'2-digit',minute:'2-digit'})}</small>
        </div>
        <div className="assistant-source-list">
          {result.answer.sources.map(source=><article key={`${source.kind}-${source.id}`}>
            <div>
              <strong>{source.label}</strong>
              <span>{source.detail}</span>
            </div>
            <b>{formatMoney(source.amountMinor)}</b>
          </article>)}
        </div>
        {(result.answer.intent==='remaining_to_pay'||result.answer.intent==='available_now')&&<div className="assistant-source-foot">
          <span>{l('Soma das fontes exibidas','Sum of displayed sources','Suma de las fuentes mostradas')}</span>
          <strong>{formatMoney(sourceTotal)}</strong>
        </div>}
      </div>}

      <div className="assistant-next-questions">
        <span>{l('Você também pode perguntar','You can also ask','También puedes preguntar')}</span>
        <div>
          {result.answer.suggestions.map(value=><button key={value} type="button" onClick={()=>void ask(value)}>{value}</button>)}
        </div>
      </div>
    </section>}

    <section className="assistant-trust-note">
      <strong>{l('Sem chute financeiro.','No financial guessing.','Sin adivinanzas financieras.')}</strong>
      <p>{l(
        'Essa camada calcula com os seus próprios registros. Comparações e alertas usam regras locais e explicáveis; um sinal de valor diferente ou duplicidade é convite para conferir, não acusação.',
        'This layer calculates from your own records. Comparisons and alerts use local, explainable rules; an unusual value or possible duplicate is an invitation to check, not an accusation.',
        'Esta capa calcula con tus propios registros. Las comparaciones y alertas usan reglas locales y explicables; un valor diferente o posible duplicado es una invitación a revisar, no una acusación.'
      )}</p>
    </section>
  </main>;
}
