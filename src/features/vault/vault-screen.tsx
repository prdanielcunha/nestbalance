'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getVaultDetail, getVaultPreview, listVault, searchVault, type VaultDetail, type VaultItem } from '@/src/lib/repositories/vault';
import { ProductTopbar } from '@/src/features/navigation/product-topbar';
import type { HouseholdRole } from '@/src/core/household';
import { ScopeViewSwitch, inFinancialView, useFinancialView } from '@/src/features/privacy/scope-view-switch';
import { useI18n } from '@/src/i18n/locale-provider';

export function VaultScreen({householdId,role}:{householdId:string;role:HouseholdRole}) {
  const {locale,intlLocale,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const bytes=useMemo(()=>new Intl.NumberFormat(intlLocale,{maximumFractionDigits:1}),[intlLocale]);
  const canContribute=role!=='read_only';
  const [items,setItems]=useState<VaultItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<VaultItem|null>(null);
  const [detail,setDetail]=useState<VaultDetail|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [previewUrl,setPreviewUrl]=useState<string|null>(null);
  const [previewLoading,setPreviewLoading]=useState(false);
  const [view,setView]=useFinancialView();
  const [query,setQuery]=useState('');
  const [searching,setSearching]=useState(false);
  const [searchResults,setSearchResults]=useState<VaultItem[]|null>(null);
  const [searchError,setSearchError]=useState('');

  function sizeLabel(value:number) {
    if(value<1024) return `${value} B`;
    if(value<1024*1024) return `${bytes.format(value/1024)} KB`;
    return `${bytes.format(value/(1024*1024))} MB`;
  }

  function typeLabel(mime:string) {
    if(mime==='application/pdf') return 'PDF';
    if(mime.startsWith('image/')) return l('Imagem','Image','Imagen');
    if(mime.startsWith('audio/')) return l('Áudio','Audio','Audio');
    if(mime==='text/csv') return 'CSV';
    if(mime.startsWith('text/')) return l('Texto','Text','Texto');
    return l('Documento','Document','Documento');
  }

  function understandingLabel(state:string) {
    if(state==='ai_extracted') return l('Entendido com IA','Understood with AI','Entendido con IA');
    if(state==='extracted') return l('Conteúdo entendido','Content understood','Contenido entendido');
    if(state==='needs_ai') return l('Leitura incompleta','Reading incomplete','Lectura incompleta');
    if(state==='unavailable') return l('Precisa de revisão','Needs review','Necesita revisión');
    return l('Guardado','Saved','Guardado');
  }

  async function load(silent=false) {
    if(!silent) setLoading(true);
    setError('');
    try { setItems((await listVault(householdId)).items); }
    catch { setError(l('Não conseguimos abrir seus Documentos agora.','We could not open your Documents right now.','No pudimos abrir tus Documentos ahora.')); }
    finally { if(!silent) setLoading(false); }
  }

  useEffect(()=>{
    void load();
    const onFocus=()=>void load(true);
    const onVisibility=()=>{if(document.visibilityState==='visible') void load(true);};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    return ()=>{window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);};
  },[householdId]);

  useEffect(()=>{
    const normalized=query.trim();
    if(normalized.length<2){
      setSearchResults(null);
      setSearching(false);
      setSearchError('');
      return;
    }

    let cancelled=false;
    setSearching(true);
    setSearchError('');
    const timer=window.setTimeout(()=>{
      void searchVault(householdId,normalized,view)
        .then(result=>{if(!cancelled)setSearchResults(result.items);})
        .catch(()=>{if(!cancelled){setSearchResults([]);setSearchError(l('Não conseguimos pesquisar seus Documentos agora.','We could not search your Documents right now.','No pudimos buscar en tus Documentos ahora.'));}})
        .finally(()=>{if(!cancelled)setSearching(false);});
    },300);

    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[householdId,query,view,locale]);

  useEffect(()=>()=>{ if(previewUrl) URL.revokeObjectURL(previewUrl); },[previewUrl]);

  async function openItem(item:VaultItem) {
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try { setDetail(await getVaultDetail(householdId,item.evidenceId)); }
    catch { setError(l('Não conseguimos abrir os detalhes desse documento.','We could not open this document details.','No pudimos abrir los detalles de este documento.')); }
    finally { setDetailLoading(false); }
  }

  async function preview() {
    if(!selected) return;
    setPreviewLoading(true);
    try {
      const blob=await getVaultPreview(householdId,selected.evidenceId);
      if(previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError(l('Não conseguimos abrir o original agora.','We could not open the original right now.','No pudimos abrir el original ahora.'));
    } finally { setPreviewLoading(false); }
  }

  function closeDetail(){
    if(previewLoading) return;
    setSelected(null);
    setDetail(null);
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  const visibleItems=useMemo(()=>items.filter(item=>inFinancialView(item.scope,view)),[items,view]);
  const displayItems=searchResults??visibleItems;
  const normalizedQuery=query.trim();

  const summary=useMemo(()=>{
    const signals=detail?.understood?.signals?.candidates||[];
    const values=signals.filter(x=>x.kind==='money'&&typeof x.amountMinor==='number');
    const dates=signals.filter(x=>x.kind==='date');
    const installments=signals.filter(x=>x.kind==='installment');
    const ai=detail?.understood?.extraction||null;
    const aiAmount=ai?.amountMinor&&ai.amountMinor>0?ai.amountMinor:null;
    return {values,dates,installments,ai,aiAmount,transcript:detail?.understood?.transcriptPreview||null};
  },[detail]);

  return <main className="app-shell vault-shell">
    <ProductTopbar section={l('Documentos','Documents','Documentos')}/>
    <ScopeViewSwitch value={view} onChange={setView}/>

    <section className="vault-hero">
      <span>{l('Sua memória financeira','Your financial memory','Tu memoria financiera')}</span>
      <h1>{l('Guardado sem pasta. Encontrado pela lembrança.','Saved without folders. Found by memory.','Guardado sin carpetas. Encontrado por lo que recuerdas.')}</h1>
      <p>{l(
        'Comprovantes, faturas e arquivos originais ficam preservados e ligados ao que aconteceu. Você procura pelo valor, mês, pessoa ou descrição — não pelo nome do arquivo.',
        'Receipts, statements, and original files stay preserved and linked to what happened. Search by amount, month, person, or description — not by filename.',
        'Comprobantes, resúmenes y archivos originales quedan preservados y vinculados a lo ocurrido. Busca por valor, mes, persona o descripción — no por el nombre del archivo.'
      )}</p>
      {canContribute&&<div className="vault-hero-actions">
        <Link href="/add?return=/documents" className="primary-button">{l('Enviar documento','Send document','Enviar documento')}</Link>
        <span>{l('Pode ser print, foto, PDF, CSV ou áudio.','Screenshot, photo, PDF, CSV, or audio all work.','Puede ser captura, foto, PDF, CSV o audio.')}</span>
      </div>}
    </section>

    {(visibleItems.length>0||normalizedQuery.length>0)&&<section className="vault-search-panel" aria-label={l('Pesquisar nos Documentos','Search Documents','Buscar en Documentos')}>
      <label htmlFor="vault-search">{l('Encontre pelo que você lembra','Find it by what you remember','Encuéntralo por lo que recuerdas')}</label>
      <div className="vault-search-input">
        <input
          id="vault-search"
          type="search"
          value={query}
          onChange={event=>setQuery(event.target.value)}
          placeholder={l('Ex.: comprovante da luz de setembro','E.g. September electricity receipt','Ej.: comprobante de luz de septiembre')}
          maxLength={120}
          autoComplete="off"
        />
        {query&&<button type="button" onClick={()=>setQuery('')} aria-label={l('Limpar busca','Clear search','Limpiar búsqueda')}>{l('Limpar','Clear','Limpiar')}</button>}
      </div>
      <p>{searching
        ? l('Procurando nos documentos entendidos…','Searching understood documents…','Buscando en los documentos entendidos…')
        : normalizedQuery.length>=2
          ? l(
              `${displayItems.length} resultado${displayItems.length===1?'':'s'} encontrado${displayItems.length===1?'':'s'}.`,
              `${displayItems.length} result${displayItems.length===1?'':'s'} found.`,
              `${displayItems.length} resultado${displayItems.length===1?'':'s'} encontrado${displayItems.length===1?'':'s'}.`
            )
          : l('Busque por valor, mês, estabelecimento, pessoa ou descrição.','Search by amount, month, merchant, person, or description.','Busca por valor, mes, comercio, persona o descripción.')}</p>
    </section>}

    {(error||searchError) && <p className="error-copy" role="alert">{error||searchError}</p>}

    {loading ? <div className="vault-list" aria-label={l('Carregando Documentos','Loading Documents','Cargando Documentos')}>{[0,1,2].map(i=><div className="vault-row skeleton-line" key={i}/>)}</div>
    : normalizedQuery.length>=2&&!searching&&displayItems.length===0 ? <section className="empty-state"><h3>{l('Nada encontrado com essa lembrança.','Nothing matched that memory.','Nada coincide con ese recuerdo.')}</h3><p>{l('Tente um valor, mês, estabelecimento ou outra palavra que aparecia no comprovante.','Try an amount, month, merchant, or another word that appeared on the receipt.','Prueba un valor, mes, comercio u otra palabra que aparecía en el comprobante.')}</p></section>
    : visibleItems.length===0&&normalizedQuery.length<2 ? <section className="empty-state empty-state-action">
        <div>
          <h3>{l('Seu primeiro documento pode entrar do jeito que já está.','Your first document can come in exactly as it is.','Tu primer documento puede entrar tal como está.')}</h3>
          <p>{l('Envie o print ou arquivo. O original fica preservado e o NestBalance tenta relacioná-lo ao movimento, conta ou fatura certa.','Send the screenshot or file. The original stays preserved and NestBalance tries to link it to the right movement, bill, or statement.','Envía la captura o archivo. El original queda preservado y NestBalance intenta vincularlo al movimiento, cuenta o resumen correcto.')}</p>
        </div>
        {canContribute&&<Link className="primary-button" href="/add?return=/documents">{l('Enviar agora','Send now','Enviar ahora')}</Link>}
      </section>
    : <section className="vault-list" aria-label={normalizedQuery.length>=2?l('Resultados da busca','Search results','Resultados de búsqueda'):l('Documentos guardados','Saved documents','Documentos guardados')}>
      {displayItems.map(item=><button className="vault-row" key={item.evidenceId} onClick={()=>void openItem(item)}>
        <div className="vault-file-mark">{typeLabel(item.mimeType).slice(0,1)}</div>
        <div className="vault-row-copy">
          <strong>{item.originalName}</strong>
          <span>{item.matchReason
            ? l('Encontrado por ','Found by ','Encontrado por ')+item.matchReason
            : typeLabel(item.mimeType)+' · '+sizeLabel(item.size)+' · '+understandingLabel(item.extractionState)+(item.scope==='personal'?' · '+l('Só eu','Only me','Solo yo'):'')}</span>
        </div>
        <span className="vault-row-date">{item.createdAtMs ? formatDate(new Date(item.createdAtMs),{day:'2-digit',month:'short'}) : ''}</span>
      </button>)}
    </section>}

    {selected && <div className="sheet-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeDetail();}}>
      <section className="capture-sheet vault-detail" role="dialog" aria-modal="true" aria-label={selected.originalName}>
        <div className="sheet-handle" />
        <div className="eyebrow">{l('ORIGINAL','ORIGINAL','ORIGINAL')}</div>
        <h2>{selected.originalName}</h2>
        <p>{typeLabel(selected.mimeType)} · {sizeLabel(selected.size)}{selected.scope==='personal'?' · '+l('Só eu','Only me','Solo yo'):''}</p>

        {detailLoading ? <div className="vault-detail-skeleton" /> : detail && <>
          <div className="evidence-stack">
            <div><span>{l('ORIGINAL','ORIGINAL','ORIGINAL')}</span><strong>{l('Preservado','Preserved','Preservado')}</strong><small>{l('O arquivo que você enviou permanece separado da interpretação.','The file you sent stays separate from the interpretation.','El archivo que enviaste permanece separado de la interpretación.')}</small></div>
            <div><span>{l('ENTENDEMOS','UNDERSTOOD','ENTENDIMOS')}</span><strong>{understandingLabel(detail.understood?.state||selected.extractionState)}</strong><small>{detail.understood?.aiUsed
              ? l('Houve análise por IA.','AI analysis was used.','Se usó análisis con IA.')
              : detail.understood
                ? l('Leitura determinística; sem IA remota.','Deterministic reading; no remote AI.','Lectura determinística; sin IA remota.')
                : l('Ainda não analisado.','Not analyzed yet.','Aún no analizado.')}</small></div>
            <div><span>{l('ENCONTRAMOS','FOUND','ENCONTRAMOS')}</span><strong>{summary.ai?.description || (summary.values.length+summary.dates.length+summary.installments.length
              ? l(
                  `${summary.values.length+summary.dates.length+summary.installments.length} sinais`,
                  `${summary.values.length+summary.dates.length+summary.installments.length} signals`,
                  `${summary.values.length+summary.dates.length+summary.installments.length} señales`
                )
              : l('Nenhum dado confirmado','No confirmed data','Ningún dato confirmado'))}</strong><small>{l('São candidatos; sua confirmação continua valendo mais.','These are candidates; your confirmation still takes priority.','Son candidatos; tu confirmación sigue teniendo prioridad.')}</small></div>
          </div>

          {summary.aiAmount && <div className="vault-signal-block"><span>{l('Valor principal entendido','Main amount understood','Valor principal entendido')}</span><div><b>{formatMoney(summary.aiAmount)}</b></div></div>}
          {!summary.aiAmount && summary.values.length>0 && <div className="vault-signal-block"><span>{l('Valores encontrados','Amounts found','Valores encontrados')}</span><div>{summary.values.slice(0,6).map((x,i)=><b key={`${x.start}-${i}`}>{formatMoney(x.amountMinor||0)}</b>)}</div></div>}
          {summary.installments.length>0 && <div className="vault-signal-block"><span>{l('Parcelas possíveis','Possible installments','Cuotas posibles')}</span><div>{summary.installments.slice(0,6).map((x,i)=><b key={`${x.start}-${i}`}>{x.normalized}</b>)}</div></div>}
          {summary.transcript && <div className="vault-transcript"><span>{l('Transcrição','Transcript','Transcripción')}</span><p>{summary.transcript}</p></div>}

          {!previewUrl ? <button className="primary-button vault-preview-button" disabled={previewLoading} onClick={()=>void preview()}>{previewLoading?l('Conferindo original…','Opening original…','Abriendo original…'):l('Ver original','View original','Ver original')}</button>
          : <div className="vault-preview">
              {selected.mimeType.startsWith('image/') && <img src={previewUrl} alt={selected.originalName} />}
              {selected.mimeType==='application/pdf' && <iframe src={previewUrl} title={selected.originalName} />}
              {selected.mimeType.startsWith('audio/') && <audio controls src={previewUrl} />}
              {selected.mimeType.startsWith('text/') && <iframe src={previewUrl} title={selected.originalName} />}
            </div>}
        </>}
        <div className="sheet-actions"><button className="ghost-button" disabled={previewLoading} onClick={closeDetail}>{l('Fechar','Close','Cerrar')}</button></div>
      </section>
    </div>}
  </main>;
}
