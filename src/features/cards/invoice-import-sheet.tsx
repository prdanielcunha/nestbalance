'use client';
import { useMemo, useState } from 'react';
import type { HomeCreditCard } from '@/src/lib/repositories/home';
import { ingestEvidence, analyzeEvidenceText, type UploadProgress } from '@/src/lib/repositories/evidence';
import { commitInvoice, previewInvoice, type InvoicePreviewResponse } from '@/src/lib/repositories/invoices';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const date=new Intl.DateTimeFormat('pt-BR');

function formatDate(value:string|null){
  if(!value) return 'Data a conferir';
  return date.format(new Date(value+'T12:00:00'));
}

export function InvoiceImportSheet({
  householdId,
  card,
  onClose,
  onCommitted
}:{
  householdId:string;
  card:HomeCreditCard;
  onClose:()=>void;
  onCommitted?:()=>void;
}){
  const [file,setFile]=useState<File|null>(null);
  const [working,setWorking]=useState(false);
  const [progress,setProgress]=useState<UploadProgress|null>(null);
  const [error,setError]=useState('');
  const [result,setResult]=useState<InvoicePreviewResponse|null>(null);
  const [showAll,setShowAll]=useState(false);

  const clearItems=useMemo(()=>result?.preview.items.filter(item=>item.needsReview.length===0)??[],[result]);
  const reviewItems=useMemo(()=>result?.preview.items.filter(item=>item.needsReview.length>0)??[],[result]);

  const visibleItems=useMemo(()=>{
    if(!result) return [];
    const review=result.preview.items.filter(item=>item.needsReview.length>0);
    return !showAll&&review.length?review:result.preview.items;
  },[result,showAll]);

  async function understand(){
    if(!file||working) return;
    setWorking(true);
    setError('');
    setResult(null);
    setShowAll(false);
    try{
      const evidence=await ingestEvidence(householdId,file,setProgress);
      const analysis=await analyzeEvidenceText(householdId,evidence.canonicalEvidenceId);
      if(analysis.state!=='extracted'){
        throw new Error(analysis.state==='needs_ai'?'INVOICE_REQUIRES_VISUAL_AI':'INVOICE_TEXT_UNAVAILABLE');
      }
      const preview=await previewInvoice({
        householdId,
        cardId:card.id,
        evidenceId:evidence.canonicalEvidenceId
      });
      setResult(preview);
      setProgress(null);
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVOICE_REQUIRES_VISUAL_AI'){
        setError('Esta fatura parece ser uma imagem. A leitura visual de faturas será conectada na próxima camada; prefira o PDF original por enquanto.');
      }else if(code==='INVOICE_TEXT_UNAVAILABLE'||code==='EVIDENCE_ANALYSIS_REQUIRED'){
        setError('Não encontrei texto financeiro suficiente nessa fatura.');
      }else{
        setError('Não consegui entender essa fatura agora. O arquivo original não será duplicado.');
      }
    }finally{
      setWorking(false);
    }
  }

  async function confirmClearItems(){
    if(!result||working||clearItems.length===0) return;
    setWorking(true);
    setError('');
    try{
      const committed=await commitInvoice({
        householdId,
        cardId:card.id,
        evidenceId:result.evidenceId,
        itemIds:clearItems.map(item=>item.id)
      });
      if(committed.created===0&&committed.duplicates>0){
        setError('Esses itens já estavam registrados. Nenhuma cópia foi criada.');
        return;
      }
      onCommitted?.();
      onClose();
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVOICE_REVIEW_REQUIRED'){
        setError('Há item que ainda precisa de conferência. Só confirmamos o que está claro.');
      }else if(code==='INVALID_INVOICE_SELECTION'){
        setError('A fatura mudou durante a revisão. Entenda o arquivo novamente antes de confirmar.');
      }else{
        setError('Não conseguimos confirmar essa fatura agora. Nada foi marcado como concluído.');
      }
    }finally{
      setWorking(false);
    }
  }

  return <div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!working&&onClose()}>
    <section className="capture-sheet invoice-sheet" role="dialog" aria-modal="true" aria-label="Importar fatura">
      <div className="sheet-handle"/>
      <div className="eyebrow">Fatura do cartão</div>
      <h2>{card.name}</h2>
      <p>Envie a fatura. O NestBalance separa compras, parcelas e o que pode continuar nos próximos meses antes de criar qualquer lançamento.</p>

      {!result&&<>
        <label className="file-drop invoice-file-drop">
          <input
            type="file"
            accept=".pdf,text/plain,text/csv,application/pdf"
            disabled={working}
            onChange={e=>{setFile(e.target.files?.[0]??null);setError('');}}
          />
          {file?file.name:'PDF, TXT ou CSV da fatura'}
        </label>

        {progress&&<div className="upload-status" role="status" aria-live="polite">
          <div><span>{progress.phase==='uploading'?'Guardando original…':'Conferindo arquivo…'}</span><b>{progress.percent}%</b></div>
          <progress max="100" value={progress.percent}>{progress.percent}%</progress>
        </div>}

        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={working} onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={!file||working} onClick={understand}>{working?'Entendendo…':'Entender fatura'}</button>
        </div>
      </>}

      {result&&<>
        <div className="invoice-summary-card">
          <div>
            <span>ENTENDEMOS</span>
            <strong>{result.preview.items.length} item{result.preview.items.length===1?'':'s'}</strong>
            <small>Fatura {result.preview.invoiceKey} · vence {formatDate(result.preview.dueOn)}</small>
          </div>
          <div>
            <span>CONFIRA</span>
            <strong>{result.preview.reviewCount}</strong>
            <small>{result.preview.reviewCount?'Só o que ficou ambíguo.':'Nenhuma exceção detectada.'}</small>
          </div>
        </div>

        <div className="invoice-money-strip">
          <div><span>Nesta fatura</span><strong>{money.format(result.preview.observedMinor/100)}</strong></div>
          <div><span>Parcelas futuras</span><strong>{money.format(result.preview.futureInstallmentsMinor/100)}</strong></div>
        </div>

        {result.preview.items.length===0
          ? <div className="invoice-empty"><strong>Não encontrei compras confiáveis.</strong><span>O original ficou preservado, mas nada será criado automaticamente.</span></div>
          : <>
              {result.preview.reviewCount>0&&<div className="invoice-review-toggle">
                <button type="button" className={!showAll?'active':''} onClick={()=>setShowAll(false)}>Conferir {result.preview.reviewCount}</button>
                <button type="button" className={showAll?'active':''} onClick={()=>setShowAll(true)}>Ver tudo</button>
              </div>}
              <div className="invoice-item-list">
                {visibleItems.map(item=><article className={item.needsReview.length?'invoice-item review':'invoice-item'} key={item.id}>
                  <div className="invoice-item-main">
                    <div><strong>{item.description}</strong><span>{formatDate(item.purchaseOn)}{item.kind==='fee'?' · Encargo':''}</span></div>
                    <b>{money.format(item.amountMinor/100)}</b>
                  </div>
                  {item.installment&&<div className="invoice-installment-row">
                    <span>Parcela {item.installment.current} de {item.installment.total}</span>
                    <small>{Math.max(0,item.installment.total-item.installment.current)} futura{item.installment.total-item.installment.current===1?'':'s'} projetada{item.installment.total-item.installment.current===1?'':'s'}</small>
                  </div>}
                  {item.needsReview.length>0&&<em>Confira {item.needsReview.includes('purchase_date')?'a data da compra':'o vencimento usado para projetar as parcelas'}</em>}
                </article>)}
              </div>
            </>}

        <p className="confidence-note">
          {reviewItems.length
            ? <>{clearItems.length} item{clearItems.length===1?'':'s'} claro{clearItems.length===1?'':'s'} pode{clearItems.length===1?'':'m'} ser confirmado{clearItems.length===1?'':'s'} agora. {reviewItems.length} fica{reviewItems.length===1?'':'m'} pendente{reviewItems.length===1?'':'s'} para revisão.</>
            : <>Tudo que foi identificado está claro. A confirmação cria os lançamentos uma única vez e mantém as parcelas ligadas ao mesmo plano.</>}
        </p>
        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={working} onClick={()=>{setResult(null);setFile(null);setError('');}}>Trocar arquivo</button>
          <button className="primary-button" disabled={working||clearItems.length===0} onClick={confirmClearItems}>
            {working?'Confirmando…':clearItems.length===0?'Nada claro para confirmar':<>Confirmar {clearItems.length} item{clearItems.length===1?'':'s'}</>}
          </button>
        </div>
      </>}
    </section>
  </div>;
}
