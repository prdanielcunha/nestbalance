'use client';
import { useState } from 'react';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import type { InvoicePreviewItem } from '@/src/core/invoices';
import { reviewInvoice, type InvoicePreviewResponse } from '@/src/lib/repositories/invoices';
import { useI18n } from '@/src/i18n/locale-provider';

export function InvoiceItemEditor({
  householdId,
  cardId,
  evidenceId,
  item,
  onClose,
  onUpdated
}:{
  householdId:string;
  cardId:string;
  evidenceId:string;
  item:InvoicePreviewItem|null;
  onClose:()=>void;
  onUpdated:(value:InvoicePreviewResponse)=>void;
}){
  const {locale,intlLocale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const minorToInput=(value:number)=>(value/100).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
  const [description,setDescription]=useState(item?.description||'');
  const [amount,setAmount]=useState(item?minorToInput(item.amountMinor):'');
  const [purchaseOn,setPurchaseOn]=useState(item?.purchaseOn||'');
  const [kind,setKind]=useState<'purchase'|'fee'>(item?.kind||'purchase');
  const [installmentEnabled,setInstallmentEnabled]=useState(Boolean(item?.installment));
  const [installmentCurrent,setInstallmentCurrent]=useState(item?.installment?String(item.installment.current):'');
  const [installmentTotal,setInstallmentTotal]=useState(item?.installment?String(item.installment.total):'');
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');

  async function save(){
    if(working) return;
    const amountMinor=parseMoneyInputToMinor(amount,locale);
    if(amountMinor===null||amountMinor<=0){
      setError(l('Confira o valor da compra.','Check the purchase amount.','Revisa el valor de la compra.'));
      return;
    }
    if(description.trim().length<2){
      setError(l('Informe uma descrição simples para esse item.','Enter a simple description for this item.','Escribe una descripción simple para este elemento.'));
      return;
    }

    let installment:null|{current:number;total:number}=null;
    if(installmentEnabled){
      const current=Number(installmentCurrent);
      const total=Number(installmentTotal);
      if(!Number.isInteger(current)||!Number.isInteger(total)||current<1||total<2||current>total){
        setError(l('Confira a parcela atual e o total de parcelas.','Check the current installment and total installments.','Revisa la cuota actual y el total de cuotas.'));
        return;
      }
      installment={current,total};
    }

    setWorking(true);
    setError('');
    try{
      const draft={
        description:description.trim(),
        amountMinor,
        purchaseOn:purchaseOn||null,
        kind,
        installment
      };
      const response=await reviewInvoice({
        householdId,
        cardId,
        evidenceId,
        review:item
          ? {action:'update',itemId:item.id,item:draft}
          : {action:'add',item:draft}
      });
      onUpdated(response);
      onClose();
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVOICE_ITEM_ALREADY_COMMITTED'){
        setError(l(
          'Esse item já foi confirmado. A correção precisa ser feita como ajuste auditável separado.',
          'This item has already been confirmed. Any correction must be made as a separate auditable adjustment.',
          'Este elemento ya fue confirmado. La corrección debe hacerse como un ajuste auditable separado.'
        ));
      }else if(code==='INVALID_DATE'){
        setError(l('Confira a data da compra.','Check the purchase date.','Revisa la fecha de la compra.'));
      }else if(code==='INVALID_INSTALLMENT'){
        setError(l('Confira o parcelamento informado.','Check the installment information.','Revisa la información de las cuotas.'));
      }else{
        setError(l('Não conseguimos salvar essa correção agora.','We could not save this correction right now.','No pudimos guardar esta corrección ahora.'));
      }
    }finally{
      setWorking(false);
    }
  }

  async function remove(){
    if(!item||working) return;
    setWorking(true);
    setError('');
    try{
      const response=await reviewInvoice({
        householdId,
        cardId,
        evidenceId,
        review:{action:'remove',itemId:item.id}
      });
      onUpdated(response);
      onClose();
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVOICE_ITEM_ALREADY_COMMITTED'){
        setError(l(
          'Esse item já foi confirmado e não pode ser apagado silenciosamente.',
          'This item has already been confirmed and cannot be silently deleted.',
          'Este elemento ya fue confirmado y no puede eliminarse silenciosamente.'
        ));
      }else{
        setError(l('Não conseguimos remover esse item agora.','We could not remove this item right now.','No pudimos eliminar este elemento ahora.'));
      }
    }finally{
      setWorking(false);
    }
  }

  return <div className="nested-sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!working&&onClose()}>
    <section className="invoice-editor-sheet" role="dialog" aria-modal="true" aria-label={item?l('Corrigir item da fatura','Correct statement item','Corregir elemento del resumen'):l('Adicionar item à fatura','Add item to statement','Agregar elemento al resumen')}>
      <div className="eyebrow">{item?l('Conferir item','Review item','Revisar elemento'):l('Item que faltou','Missing item','Elemento faltante')}</div>
      <h3>{item?l('Está certo assim?','Is this correct?','¿Está correcto así?'):l('Adicionar compra ou encargo','Add purchase or fee','Agregar compra o cargo')}</h3>

      <label className="field-label" htmlFor="review-description">{l('Descrição','Description','Descripción')}</label>
      <input id="review-description" className="premium-input" value={description} maxLength={120} onChange={e=>setDescription(e.target.value)} placeholder={l('Ex.: Mercado','E.g. Grocery store','Ej.: Supermercado')}/>

      <div className="invoice-editor-grid">
        <div>
          <label className="field-label" htmlFor="review-amount">{l('Valor','Amount','Valor')}</label>
          <div className="money-input-wrap"><span>R$</span><input id="review-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
        </div>
        <div>
          <label className="field-label" htmlFor="review-date">{l('Data','Date','Fecha')}</label>
          <input id="review-date" className="premium-input" type="date" value={purchaseOn} onChange={e=>setPurchaseOn(e.target.value)}/>
        </div>
      </div>

      <label className="field-label">{l('Tipo','Type','Tipo')}</label>
      <div className="invoice-kind-picker">
        <button type="button" className={kind==='purchase'?'active':''} onClick={()=>setKind('purchase')}>{l('Compra','Purchase','Compra')}</button>
        <button type="button" className={kind==='fee'?'active':''} onClick={()=>setKind('fee')}>{l('Encargo','Fee','Cargo')}</button>
      </div>

      <label className="invoice-installment-toggle">
        <input type="checkbox" checked={installmentEnabled} onChange={e=>setInstallmentEnabled(e.target.checked)}/>
        <span>{l('É uma compra parcelada','This purchase is in installments','Es una compra en cuotas')}</span>
      </label>

      {installmentEnabled&&<div className="invoice-editor-grid">
        <div>
          <label className="field-label" htmlFor="review-current">{l('Parcela atual','Current installment','Cuota actual')}</label>
          <input id="review-current" className="premium-input" inputMode="numeric" value={installmentCurrent} onChange={e=>setInstallmentCurrent(e.target.value.replace(/\D/g,'').slice(0,3))} placeholder="3"/>
        </div>
        <div>
          <label className="field-label" htmlFor="review-total">{l('Total de parcelas','Total installments','Total de cuotas')}</label>
          <input id="review-total" className="premium-input" inputMode="numeric" value={installmentTotal} onChange={e=>setInstallmentTotal(e.target.value.replace(/\D/g,'').slice(0,3))} placeholder="10"/>
        </div>
      </div>}

      {error&&<p className="error-copy" role="alert">{error}</p>}
      <div className="sheet-actions invoice-editor-actions">
        {item&&<button className="danger-ghost-button" disabled={working} onClick={remove}>{l('Não pertence à fatura','Does not belong to this statement','No pertenece a este resumen')}</button>}
        <button className="ghost-button" disabled={working} onClick={onClose}>{l('Cancelar','Cancel','Cancelar')}</button>
        <button className="primary-button" disabled={working} onClick={save}>{working?l('Salvando…','Saving…','Guardando…'):l('Salvar correção','Save correction','Guardar corrección')}</button>
      </div>
    </section>
  </div>;
}
