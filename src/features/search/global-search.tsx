'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { bootstrapSession } from '@/src/lib/repositories/session';
import { searchHousehold, type UniversalSearchResult } from '@/src/lib/repositories/search';
import { useI18n } from '@/src/i18n/locale-provider';

export function GlobalSearch(){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [open,setOpen]=useState(false);
  const [householdId,setHouseholdId]=useState('');
  const [query,setQuery]=useState('');
  const [results,setResults]=useState<UniversalSearchResult[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const inputRef=useRef<HTMLInputElement|null>(null);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();
        setOpen(value=>!value);
      }
      if(event.key==='Escape') setOpen(false);
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[]);

  useEffect(()=>{
    if(!open) return;
    inputRef.current?.focus();
    if(householdId) return;
    void bootstrapSession().then(session=>setHouseholdId(session.householdId)).catch(()=>setError(l('Busca indisponível agora.','Search is unavailable right now.','La búsqueda no está disponible ahora.')));
  },[open,householdId]);

  useEffect(()=>{
    if(!open||!householdId||query.trim().length<2){
      setResults([]);
      setLoading(false);
      return;
    }
    let disposed=false;
    const timer=window.setTimeout(async()=>{
      setLoading(true);setError('');
      try{
        const response=await searchHousehold(householdId,query.trim());
        if(!disposed) setResults(response.results);
      }catch{
        if(!disposed) setError(l('Não conseguimos buscar agora.','We could not search right now.','No pudimos buscar ahora.'));
      }finally{
        if(!disposed) setLoading(false);
      }
    },220);
    return ()=>{disposed=true;window.clearTimeout(timer);};
  },[open,householdId,query]);

  const typeLabel=(type:UniversalSearchResult['type'])=>({
    movement:l('Movimento','Movement','Movimiento'),
    commitment:l('Conta','Bill','Cuenta'),
    account:l('Conta bancária','Account','Cuenta bancaria'),
    pot:l('Cofrinho','Savings pot','Alcancía'),
    document:l('Documento','Document','Documento')
  } as const)[type];

  return <>
    <button type="button" className="global-search-trigger" onClick={()=>setOpen(true)} aria-label={l('Buscar em tudo','Search everything','Buscar en todo')}>
      <span>{l('Buscar','Search','Buscar')}</span><kbd>⌘K</kbd>
    </button>
    {open&&<div className="global-search-backdrop" role="presentation" onMouseDown={event=>event.currentTarget===event.target&&setOpen(false)}>
      <section className="global-search-dialog" role="dialog" aria-modal="true" aria-label={l('Busca universal','Universal search','Búsqueda universal')}>
        <div className="global-search-input-wrap">
          <input ref={inputRef} value={query} onChange={event=>setQuery(event.target.value)} placeholder={l('Movimento, conta, documento, Cofrinho…','Movement, bill, document, savings pot…','Movimiento, cuenta, documento, alcancía…')} aria-label={l('Buscar','Search','Buscar')}/>
          <button type="button" onClick={()=>setOpen(false)} aria-label={l('Fechar busca','Close search','Cerrar búsqueda')}>×</button>
        </div>
        <div className="global-search-results" aria-live="polite">
          {loading&&<p>{l('Buscando…','Searching…','Buscando…')}</p>}
          {error&&<p className="error-copy">{error}</p>}
          {!loading&&!error&&query.trim().length<2&&<p>{l('Digite pelo menos duas letras. A busca é local e determinística sobre os dados que você pode ver.','Type at least two letters. Search is deterministic over data you are allowed to see.','Escribe al menos dos letras. La búsqueda es determinística sobre los datos que puedes ver.')}</p>}
          {!loading&&!error&&query.trim().length>=2&&results.length===0&&<p>{l('Nada encontrado.','Nothing found.','No se encontró nada.')}</p>}
          {results.map(item=><Link key={item.type+':'+item.id} href={item.href} onClick={()=>setOpen(false)}>
            <span>{typeLabel(item.type)}</span>
            <strong>{item.label}</strong>
            {item.secondary&&<small>{item.secondary}</small>}
          </Link>)}
        </div>
      </section>
    </div>}
  </>;
}
