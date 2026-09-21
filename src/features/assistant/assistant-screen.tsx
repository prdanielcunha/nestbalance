'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { askFinanceAssistant, type AssistantAnswerResponse } from '@/src/lib/repositories/assistant';
import { AppNav } from '@/src/features/navigation/app-nav';
import type { HouseholdRole } from '@/src/core/household';
import { ScopeViewSwitch, type FinancialView } from '@/src/features/privacy/scope-view-switch';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const time=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'});

const starters=[
  'Quanto ainda falta pagar?',
  'Quanto tenho disponível?',
  'O que já está comprometido nos próximos meses?'
];

export function AssistantScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
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
      setError('Não conseguimos consultar seus dados agora.');
    }finally{
      setLoading(false);
    }
  }

  return <main className="app-shell assistant-shell">
    <header className="topbar">
      <div>
        <div className="eyebrow">NestBalance</div>
        <span className="topbar-subtitle">Assistente</span>
      </div>
<Link href="/household" className="avatar-dot" aria-label="Lar e acessos" />
    </header>
    <ScopeViewSwitch value={view} onChange={next=>{setView(next);setResult(null);setError('');}}/>

    <section className="assistant-hero">
      <div className="assistant-orb" aria-hidden="true"><span/></div>
      <span>Seu dinheiro, explicado com os seus dados</span>
      <h1>Pergunte sem precisar montar conta nenhuma.</h1>
      <p>{view==='household'?'O Assistente usa somente os dados compartilhados do Lar.':view==='personal'?'O Assistente usa somente os seus itens Pessoais.':'O Assistente combina o Lar com os seus itens Pessoais, sem incluir dados pessoais de outras pessoas.'} Quando não souber, ele diz que não sabe.</p>

      <div className="assistant-composer">
        <textarea
          value={question}
          onChange={e=>setQuestion(e.target.value)}
          placeholder="Ex.: quanto ainda falta pagar?"
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
            {loading?'Consultando…':'Perguntar'}
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
          <span>{result.answer.intent==='unsupported'?'AINDA NÃO SEI RESPONDER':'RESPOSTA COMPROVADA'}</span>
          <h2>{result.answer.title}</h2>
          <p>{result.answer.summary}</p>
        </div>
        {result.answer.answerMinor!==null&&
          <strong className="assistant-answer-amount">{money.format(result.answer.answerMinor/100)}</strong>}
      </div>

      {result.answer.cards.length>0&&<div className="assistant-card-grid">
        {result.answer.cards.map((card,index)=><article key={`${card.label}-${index}`}>
          <span>{card.label}</span>
          <strong>{money.format(card.amountMinor/100)}</strong>
          <small>{card.detail}</small>
        </article>)}
      </div>}

      {result.answer.sources.length>0&&<div className="assistant-sources">
        <div className="assistant-sources-title">
          <div>
            <span>{view==='household'?'FONTES DO LAR':view==='personal'?'FONTES PESSOAIS':'FONTES DA SUA VISÃO'}</span>
            <strong>{result.answer.sources.length} registro{result.answer.sources.length===1?'':'s'} usado{result.answer.sources.length===1?'':'s'}</strong>
          </div>
          <small>Atualizado às {time.format(new Date(result.asOf))}</small>
        </div>
        <div className="assistant-source-list">
          {result.answer.sources.map(source=><article key={`${source.kind}-${source.id}`}>
            <div>
              <strong>{source.label}</strong>
              <span>{source.detail}</span>
            </div>
            <b>{money.format(source.amountMinor/100)}</b>
          </article>)}
        </div>
        <div className="assistant-source-foot">
          <span>Soma das fontes exibidas</span>
          <strong>{money.format(sourceTotal/100)}</strong>
        </div>
      </div>}

      <div className="assistant-next-questions">
        <span>Você também pode perguntar</span>
        <div>
          {result.answer.suggestions.map(value=><button key={value} type="button" onClick={()=>void ask(value)}>{value}</button>)}
        </div>
      </div>
    </section>}

    <section className="assistant-trust-note">
      <strong>Sem chute financeiro.</strong>
      <p>Essa primeira camada não usa opinião nem aconselhamento de investimento. Ela calcula e explica o que já existe nos seus dados.</p>
    </section>

    <AppNav canContribute={role!=='read_only'}/>
  </main>;
}
