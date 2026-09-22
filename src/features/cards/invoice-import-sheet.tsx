'use client';
import { useMemo, useState } from 'react';
import type { InvoicePreviewItem } from '@/src/core/invoices';
import type { HomeCreditCard } from '@/src/lib/repositories/home';
import { ingestEvidence, analyzeEvidenceText, type UploadProgress } from '@/src/lib/repositories/evidence';
import { analyzeInvoiceImage, commitInvoice, previewInvoice, reviewInvoice, type InvoicePreviewResponse } from '@/src/lib/repositories/invoices';
import { InvoiceItemEditor } from '@/src/features/cards/invoice-item-editor';
import { useI18n } from '@/src/i18n/locale-provider';

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
  const {locale,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const dateLabel=(value:string|null)=>value?formatDate(new Date(value+'T12:00:00'),{day:'2-digit',month:'2-digit',year:'numeric'}):l('Data a conferir','Date to review','Fecha por revisar');
  const [file,setFile]=useState<File|null>(null);
  const [working,setWorking]=useState(false);
  const [progress,setProgress]=useState<UploadProgress|null>(null);
  const [error,setError]=useState('');
  const [result,setResult]=useState<InvoicePreviewResponse|null>(null);
  const [showAll,setShowAll]=useState(false);
  const [editingItem,setEditingItem]=useState<InvoicePreviewItem|null|'new'>(null);

  const clearItems=useMemo(()=>result?.preview.items.filter(item=>item.needsReview.length===0)??[],[result]);
  const reviewItems=useMemo(()=>result?.preview.items.filter(item=>item.needsReview.length>0)??[],[result]);
  const globalReview=useMemo(()=>result?.preview.globalNeedsReview??[],[result]);

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
      if(analysis.state==='needs_ai'){
        if(file.type.startsWith('image/')){
          const visual=await analyzeInvoiceImage({
            householdId,
            cardId:card.id,
            evidenceId:evidence.canonicalEvidenceId
          });
          setResult(visual);
          setProgress(null);
          return;
        }
        throw new Error('INVOICE_TEXT_UNAVAILABLE');
      }
      if(analysis.state!=='extracted') throw new Error('INVOICE_TEXT_UNAVAILABLE');

      const preview=await previewInvoice({
        householdId,
        cardId:card.id,
        evidenceId:evidence.canonicalEvidenceId
      });
      setResult(preview);
      setProgress(null);
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='AI_NOT_CONFIGURED'){
        setError(l('A leitura visual inteligente não está conectada neste ambiente. O original foi preservado.','Visual intelligent reading is not connected in this environment. The original was preserved.','La lectura visual inteligente no está conectada en este entorno. El original fue preservado.'));
      }else if(code==='AI_ANALYSIS_IN_PROGRESS'){
        setError(l('Essa imagem já está sendo analisada. Tente entender a fatura novamente em instantes.','This image is already being analyzed. Try understanding the statement again shortly.','Esta imagen ya se está analizando. Intenta entender el resumen nuevamente en unos instantes.'));
      }else if(code==='INVOICE_IMAGE_TYPE_REQUIRED'||code==='INVOICE_IMAGE_TOO_LARGE'){
        setError(l('Não consegui usar essa imagem como fatura. Confira o formato e o tamanho.','I could not use this image as a statement. Check its format and size.','No pude usar esta imagen como resumen. Revisa el formato y el tamaño.'));
      }else if(code==='INVOICE_TEXT_UNAVAILABLE'||code==='EVIDENCE_ANALYSIS_REQUIRED'){
        setError(l('Não encontrei texto financeiro suficiente nessa fatura.','I could not find enough financial text in this statement.','No encontré suficiente texto financiero en este resumen.'));
      }else{
        setError(l('Não consegui entender essa fatura agora. O arquivo original não será duplicado.','I could not understand this statement right now. The original file will not be duplicated.','No pude entender este resumen ahora. El archivo original no será duplicado.'));
      }
    }finally{
      setWorking(false);
    }
  }

  async function acknowledgeVisualReview(){
    if(!result||working) return;
    setWorking(true);
    setError('');
    try{
      const reviewed=await reviewInvoice({
        householdId,
        cardId:card.id,
        evidenceId:result.evidenceId,
        review:{action:'acknowledge_visual'}
      });
      setResult(reviewed);
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVOICE_ITEMS_STILL_NEED_REVIEW'){
        setError(l('Ainda há itens individuais que precisam de conferência.','There are still individual items that need review.','Todavía hay elementos individuales que necesitan revisión.'));
      }else{
        setError(l('Não conseguimos concluir essa conferência agora.','We could not complete this review right now.','No pudimos completar esta revisión ahora.'));
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
        setError(l('Esses itens já estavam registrados. Nenhuma cópia foi criada.','These items were already recorded. No duplicate was created.','Estos elementos ya estaban registrados. No se creó ninguna copia.'));
        return;
      }
      onCommitted?.();
      onClose();
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVOICE_REVIEW_REQUIRED'){
        setError(l('Há item que ainda precisa de conferência. Só confirmamos o que está claro.','An item still needs review. We only confirm what is clear.','Todavía hay un elemento por revisar. Solo confirmamos lo que está claro.'));
      }else if(code==='INVALID_INVOICE_SELECTION'){
        setError(l('A fatura mudou durante a revisão. Entenda o arquivo novamente antes de confirmar.','The statement changed during review. Analyze the file again before confirming.','El resumen cambió durante la revisión. Analiza el archivo nuevamente antes de confirmar.'));
      }else{
        setError(l('Não conseguimos confirmar essa fatura agora. Nada foi marcado como concluído.','We could not confirm this statement right now. Nothing was marked complete.','No pudimos confirmar este resumen ahora. Nada fue marcado como completado.'));
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
            accept="image/*,.pdf,text/plain,text/csv,application/pdf"
            disabled={working}
            onChange={e=>{setFile(e.target.files?.[0]??null);setError('');}}
          />
          {file?file.name:'Screenshot, foto, PDF, TXT ou CSV da fatura'}
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
            <small>Fatura {result.preview.invoiceKey} · vence {dateLabel(result.preview.dueOn)}</small>
          </div>
          <div>
            <span>CONFIRA</span>
            <strong>{result.preview.reviewCount}</strong>
            <small>{result.preview.reviewCount?'Só o que ficou ambíguo.':'Nenhuma exceção detectada.'}</small>
          </div>
        </div>

        <div className="invoice-money-strip">
          <div><span>Nesta fatura</span><strong>{formatMoney(result.preview.observedMinor)}</strong></div>
          <div><span>Parcelas futuras</span><strong>{formatMoney(result.preview.futureInstallmentsMinor)}</strong></div>
        </div>

        {result.preview.statementTotalMinor!==null&&<div className={result.preview.reconciliationDeltaMinor===0?'invoice-reconciliation ok':'invoice-reconciliation review'}>
          <div><span>Total visível da fatura</span><strong>{formatMoney(result.preview.statementTotalMinor)}</strong></div>
          <div><span>Itens reconhecidos</span><strong>{formatMoney(result.preview.observedMinor)}</strong></div>
          <small>{result.preview.reconciliationDeltaMinor===0
            ? 'A soma dos itens reconhecidos bate com o total visível.'
            : 'A soma não fecha com o total da fatura. A liquidação ficará bloqueada até a revisão.'}</small>
        </div>}

        {globalReview.length>0&&<div className="invoice-global-review" role="status">
          <strong>Há uma conferência geral da fatura.</strong>
          <span>{globalReview.includes('statement_total_mismatch')
            ? 'O total visível não bate com a soma das compras reconhecidas.'
            : globalReview.includes('no_invoice_items')
              ? 'Não encontrei linhas de compra suficientes nessa imagem.'
              : 'A imagem tem trechos que precisam de uma conferência antes de fechar a fatura.'}</span>
          <div className="invoice-global-actions">
            <button type="button" onClick={()=>setEditingItem('new')}>Adicionar item que faltou</button>
            {globalReview.includes('visual_invoice')&&reviewItems.length===0&&
              <button type="button" disabled={working} onClick={acknowledgeVisualReview}>Conferi a imagem inteira</button>}
          </div>
        </div>}

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
                    <div><strong>{item.description}</strong><span>{dateLabel(item.purchaseOn)}{item.kind==='fee'?' · Encargo':''}</span></div>
                    <b>{formatMoney(item.amountMinor)}</b>
                  </div>
                  {item.installment&&<div className="invoice-installment-row">
                    <span>Parcela {item.installment.current} de {item.installment.total}</span>
                    <small>{Math.max(0,item.installment.total-item.installment.current)} futura{item.installment.total-item.installment.current===1?'':'s'} projetada{item.installment.total-item.installment.current===1?'':'s'}</small>
                  </div>}
                  <div className="invoice-item-footer">
                    {item.needsReview.length>0
                      ? <em>Confira {item.needsReview.includes('purchase_date')?'a data da compra':item.needsReview.includes('invoice_due_date')?'o vencimento usado para projetar as parcelas':'os dados reconhecidos'}</em>
                      : <span>{result.preview.humanReviewed?'Conferido':'Reconhecido com boa confiança'}</span>}
                    <button type="button" onClick={()=>setEditingItem(item)}>{item.needsReview.length?'Corrigir':'Editar'}</button>
                  </div>
                </article>)}
              </div>
              <button className="invoice-add-item-button" type="button" onClick={()=>setEditingItem('new')}>Adicionar item que faltou</button>
            </>}

        <p className="confidence-note">
          {reviewItems.length||globalReview.length
            ? <>{clearItems.length} item{clearItems.length===1?'':'s'} claro{clearItems.length===1?'':'s'} pode{clearItems.length===1?'':'m'} ser confirmado{clearItems.length===1?'':'s'} agora. O que ficou ambíguo não será fechado automaticamente.</>
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
      {result&&editingItem&&<InvoiceItemEditor
        householdId={householdId}
        cardId={card.id}
        evidenceId={result.evidenceId}
        item={editingItem==='new'?null:editingItem}
        onClose={()=>setEditingItem(null)}
        onUpdated={value=>{setResult(value);setEditingItem(null);setError('');}}
      />}
    </section>
  </div>;
}
