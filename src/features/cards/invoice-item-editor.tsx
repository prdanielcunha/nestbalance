'use client';
import { useState } from 'react';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import type { InvoicePreviewItem } from '@/src/core/invoices';
import { reviewInvoice, type InvoicePreviewResponse } from '@/src/lib/repositories/invoices';

function minorToInput(value:number){
  return (value/100).toFixed(2).replace('.',',');
}

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
    const amountMinor=parseMoneyInputToMinor(amount);
    if(amountMinor===null||amountMinor<=0){
      setError('Confira o valor da compra.');
      return;
    }
    if(description.trim().length<2){
      setError('Informe uma descrição simples para esse item.');
      return;
    }

    let installment:null|{current:number;total:number}=null;
    if(installmentEnabled){
      const current=Number(installmentCurrent);
      const total=Number(installmentTotal);
      if(!Number.isInteger(current)||!Number.isInteger(total)||current<1||total<2||current>total){
        setError('Confira a parcela atual e o total de parcelas.');
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
        setError('Esse item já foi confirmado. A correção precisa ser feita como ajuste auditável separado.');
      }else if(code==='INVALID_DATE'){
        setError('Confira a data da compra.');
      }else if(code==='INVALID_INSTALLMENT'){
        setError('Confira o parcelamento informado.');
      }else{
        setError('Não conseguimos salvar essa correção agora.');
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
        setError('Esse item já foi confirmado e não pode ser apagado silenciosamente.');
      }else{
        setError('Não conseguimos remover esse item agora.');
      }
    }finally{
      setWorking(false);
    }
  }

  return <div className="nested-sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!working&&onClose()}>
    <section className="invoice-editor-sheet" role="dialog" aria-modal="true" aria-label={item?'Corrigir item da fatura':'Adicionar item à fatura'}>
      <div className="eyebrow">{item?'Conferir item':'Item que faltou'}</div>
      <h3>{item?'Está certo assim?':'Adicionar compra ou encargo'}</h3>

      <label className="field-label" htmlFor="review-description">Descrição</label>
      <input id="review-description" className="premium-input" value={description} maxLength={120} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: Mercado"/>

      <div className="invoice-editor-grid">
        <div>
          <label className="field-label" htmlFor="review-amount">Valor</label>
          <div className="money-input-wrap"><span>R$</span><input id="review-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></div>
        </div>
        <div>
          <label className="field-label" htmlFor="review-date">Data</label>
          <input id="review-date" className="premium-input" type="date" value={purchaseOn} onChange={e=>setPurchaseOn(e.target.value)}/>
        </div>
      </div>

      <label className="field-label">Tipo</label>
      <div className="invoice-kind-picker">
        <button type="button" className={kind==='purchase'?'active':''} onClick={()=>setKind('purchase')}>Compra</button>
        <button type="button" className={kind==='fee'?'active':''} onClick={()=>setKind('fee')}>Encargo</button>
      </div>

      <label className="invoice-installment-toggle">
        <input type="checkbox" checked={installmentEnabled} onChange={e=>setInstallmentEnabled(e.target.checked)}/>
        <span>É uma compra parcelada</span>
      </label>

      {installmentEnabled&&<div className="invoice-editor-grid">
        <div>
          <label className="field-label" htmlFor="review-current">Parcela atual</label>
          <input id="review-current" className="premium-input" inputMode="numeric" value={installmentCurrent} onChange={e=>setInstallmentCurrent(e.target.value.replace(/\D/g,'').slice(0,3))} placeholder="3"/>
        </div>
        <div>
          <label className="field-label" htmlFor="review-total">Total de parcelas</label>
          <input id="review-total" className="premium-input" inputMode="numeric" value={installmentTotal} onChange={e=>setInstallmentTotal(e.target.value.replace(/\D/g,'').slice(0,3))} placeholder="10"/>
        </div>
      </div>}

      {error&&<p className="error-copy" role="alert">{error}</p>}
      <div className="sheet-actions invoice-editor-actions">
        {item&&<button className="danger-ghost-button" disabled={working} onClick={remove}>Não pertence à fatura</button>}
        <button className="ghost-button" disabled={working} onClick={onClose}>Cancelar</button>
        <button className="primary-button" disabled={working} onClick={save}>{working?'Salvando…':'Salvar correção'}</button>
      </div>
    </section>
  </div>;
}
