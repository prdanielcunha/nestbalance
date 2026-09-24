'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { HouseholdRole } from '@/src/core/household';
import { loadFinancialInbox, type FinancialInboxItem } from '@/src/lib/repositories/inbox';
import { pendingOfflineMutationCount } from '@/src/lib/offline-mutation-queue';
import { useHouseholdRevisionRefresh } from '@/src/features/realtime/use-household-revision';
import { AppShell } from '@/src/features/navigation/app-shell';
import { useI18n } from '@/src/i18n/locale-provider';

export function FinancialInboxScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {locale,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [items,setItems]=useState<FinancialInboxItem[]>([]);
  const [offlinePending,setOfflinePending]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  async function refresh(silent=false){
    if(!silent) setLoading(true);
    try{
      const [data,pending]=await Promise.all([
        loadFinancialInbox(householdId),
        pendingOfflineMutationCount().catch(()=>0)
      ]);
      setItems(data.items);setOfflinePending(pending);setError('');
    }catch{
      setError(l('Não conseguimos abrir sua caixa de entrada agora.','We could not open your inbox right now.','No pudimos abrir tu bandeja de entrada ahora.'));
    }finally{if(!silent)setLoading(false);}
  }
  useEffect(()=>{void refresh();},[householdId]);
  useHouseholdRevisionRefresh(householdId,()=>refresh(true),25_000,['documents','movements','invoices','home']);

  const groups={
    review:items.filter(item=>item.stage==='review'),
    processing:items.filter(item=>item.stage==='processing'),
    resolved:items.filter(item=>item.stage==='resolved')
  };

  const kindLabel=(item:FinancialInboxItem)=>item.kind==='document'?l('Documento','Document','Documento'):item.kind==='invoice'?l('Fatura','Statement','Resumen'):item.kind==='commitment'?l('Conta','Bill','Cuenta'):l('Movimento','Movement','Movimiento');
  const secondary=(item:FinancialInboxItem)=>{
    if(item.secondary==='invoice_partial') return l('Fatura ainda em revisão','Statement still under review','Resumen todavía en revisión');
    if(item.secondary==='document_needs_review') return l('Documento lido · falta transformar em registro','Document read · needs a record','Documento leído · falta convertirlo en registro');
    if(item.secondary==='receiving_or_reading') return l('Recebendo ou lendo','Receiving or reading','Recibiendo o leyendo');
    if(item.secondary==='capture_needs_review') return l('Ainda há campos para conferir','Some fields still need review','Todavía hay campos por revisar');
    return l('Resolvido','Resolved','Resuelto');
  };

  return <AppShell className="inbox-shell" subtitle={l('Caixa de entrada','Inbox','Bandeja de entrada')} canContribute={role!=='read_only'} headerActions={<Link className="text-link" href="/add?return=/inbox">{l('Adicionar','Add','Agregar')}</Link>}>
    <section className="inbox-hero">
      <span>{l('TUDO QUE CHEGA','EVERYTHING THAT ARRIVES','TODO LO QUE LLEGA')}</span>
      <h1>{l('Confira só as exceções.','Review only the exceptions.','Revisa solo las excepciones.')}</h1>
      <p>{l('Print, PDF, CSV, áudio, texto e itens confirmados aparecem numa fila única. O que já está resolvido fica agrupado e sai do caminho.','Screenshots, PDFs, CSVs, audio, text, and confirmed items appear in one queue. Resolved items are grouped and stay out of the way.','Capturas, PDF, CSV, audio, texto y elementos confirmados aparecen en una sola fila. Lo resuelto queda agrupado y fuera del camino.')}</p>
    </section>
    {offlinePending>0&&<div className="inbox-offline-banner" role="status"><strong>{offlinePending}</strong><span>{l('alteração(ões) aguardando internet para sincronizar','change(s) waiting for internet to sync','cambio(s) esperando internet para sincronizar')}</span></div>}
    {error&&<p className="error-copy" role="alert">{error}</p>}
    {loading?<div className="inbox-loading"/>:<>
      <section className="inbox-group attention">
        <div className="section-title"><div><h2>{l('Precisa de você','Needs you','Te necesita')}</h2><span>{l('exceções primeiro','exceptions first','excepciones primero')}</span></div><strong>{groups.review.length}</strong></div>
        {groups.review.length?groups.review.map(item=><Link href={item.href} className="inbox-row" key={item.id}><div><span>{kindLabel(item)}{item.scope==='personal'?' · '+l('Pessoal','Personal','Personal'):''}</span><strong>{item.title}</strong><small>{secondary(item)}</small></div><b>→</b></Link>):<p className="quiet-copy">{l('Nenhuma exceção esperando por você.','No exceptions are waiting for you.','No hay excepciones esperándote.')}</p>}
      </section>
      <section className="inbox-group">
        <div className="section-title"><div><h2>{l('Em andamento','In progress','En proceso')}</h2><span>{l('sem precisar ficar olhando','no need to keep watching','sin tener que estar mirando')}</span></div><strong>{groups.processing.length}</strong></div>
        {groups.processing.length?groups.processing.map(item=><Link href={item.href} className="inbox-row" key={item.id}><div><span>{kindLabel(item)}</span><strong>{item.title}</strong><small>{secondary(item)}</small></div><b>…</b></Link>):<p className="quiet-copy">{l('Nada processando agora.','Nothing is processing right now.','Nada se está procesando ahora.')}</p>}
      </section>
      <section className="inbox-group resolved">
        <details>
          <summary><span>{l('Resolvidos recentemente','Recently resolved','Resueltos recientemente')}</span><strong>{groups.resolved.length}</strong></summary>
          <div>{groups.resolved.slice(0,60).map(item=><Link href={item.href} className="inbox-row" key={item.id}><div><span>{kindLabel(item)} · {item.scope==='personal'?l('Pessoal','Personal','Personal'):l('Lar','Household','Hogar')}</span><strong>{item.title}</strong><small>{item.createdAtMs?formatDate(new Date(item.createdAtMs),{dateStyle:'medium'}):secondary(item)}</small></div><b>✓</b></Link>)}</div>
        </details>
      </section>
    </>}
  </AppShell>;
}
