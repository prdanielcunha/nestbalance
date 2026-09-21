'use client';
import { useState } from 'react';
import { CARD_BRANDS, invoiceCycleForPurchase, type CardBrand } from '@/src/core/cards';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { createHouseholdCreditCard } from '@/src/lib/repositories/cards';
import type { HomeCreditCard } from '@/src/lib/repositories/home';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const brandLabel:Record<CardBrand,string>={
  visa:'Visa',
  mastercard:'Mastercard',
  elo:'Elo',
  amex:'American Express',
  other:'Outro'
};

function todayIso(){
  const now=new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}

export function CreditCardManager({
  householdId,
  cards,
  onCreated
}:{
  householdId:string;
  cards:HomeCreditCard[];
  onCreated?:()=>void;
}){
  const [open,setOpen]=useState(false);
  const [name,setName]=useState('');
  const [brand,setBrand]=useState<CardBrand>('mastercard');
  const [last4,setLast4]=useState('');
  const [closingDay,setClosingDay]=useState('7');
  const [dueDay,setDueDay]=useState('14');
  const [limit,setLimit]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  async function save(){
    const closing=Number(closingDay);
    const due=Number(dueDay);
    const limitMinor=limit.trim()?parseMoneyInputToMinor(limit):null;

    if(name.trim().length<2){
      setError('Dê um nome simples para o cartão, como Nubank ou Itaú Platinum.');
      return;
    }
    if(!Number.isInteger(closing)||closing<1||closing>31){
      setError('Informe um dia de fechamento entre 1 e 31.');
      return;
    }
    if(!Number.isInteger(due)||due<1||due>31){
      setError('Informe um dia de vencimento entre 1 e 31.');
      return;
    }
    if(last4.trim()&&!/^\d{4}$/.test(last4.trim())){
      setError('Se quiser informar, use somente os 4 últimos dígitos.');
      return;
    }
    if(limitMinor!==null&&limitMinor<0){
      setError('O limite do cartão precisa ser zero ou maior.');
      return;
    }

    setSaving(true);
    setError('');
    try{
      await createHouseholdCreditCard({
        householdId,
        name:name.trim(),
        brand,
        closingDay:closing,
        dueDay:due,
        last4:last4.trim()||undefined,
        limitMinor
      });
      setOpen(false);
      setName('');
      setBrand('mastercard');
      setLast4('');
      setClosingDay('7');
      setDueDay('14');
      setLimit('');
      onCreated?.();
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVALID_LAST4') setError('Os últimos dígitos precisam ter exatamente 4 números.');
      else if(code==='INVALID_CLOSING_DAY'||code==='INVALID_DUE_DAY') setError('Confira as datas do cartão.');
      else setError('Não conseguimos guardar esse cartão agora.');
    }finally{
      setSaving(false);
    }
  }

  return <>
    <section className="cards-section">
      <div className="section-title">
        <div><h2>Cartões</h2><span>faturas e parcelas no lugar certo</span></div>
        <button className="section-action" type="button" onClick={()=>setOpen(true)}>Adicionar cartão</button>
      </div>

      {cards.length===0
        ? <button className="card-empty" type="button" onClick={()=>setOpen(true)}>
            <span>Cartão de crédito</span>
            <strong>Adicione o cartão antes de importar a primeira fatura.</strong>
            <small>O NestBalance vai usar fechamento e vencimento para entender em qual fatura cada compra entra.</small>
          </button>
        : <div className="credit-card-grid">
            {cards.map(card=>{
              let cycle:{closingOn:string;dueOn:string;invoiceKey:string}|null=null;
              try{cycle=invoiceCycleForPurchase(todayIso(),card.closingDay,card.dueDay);}catch{}
              return <article className="credit-card-tile" key={card.id}>
                <div className="credit-card-top">
                  <span>{brandLabel[card.brand as CardBrand]||'Cartão'}</span>
                  <b>{card.last4?'•••• '+card.last4:'Crédito'}</b>
                </div>
                <h3>{card.name}</h3>
                <div className="credit-card-meta">
                  <div><span>Fecha</span><strong>dia {card.closingDay}</strong></div>
                  <div><span>Vence</span><strong>dia {card.dueDay}</strong></div>
                  <div><span>Limite</span><strong>{card.limitMinor===null?'Não informado':money.format(card.limitMinor/100)}</strong></div>
                </div>
                {cycle&&<small>Compras de hoje entram na fatura com vencimento em {new Intl.DateTimeFormat('pt-BR').format(new Date(cycle.dueOn+'T12:00:00'))}.</small>}
              </article>;
            })}
          </div>}
    </section>

    {open&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setOpen(false)}>
      <section className="capture-sheet card-sheet" role="dialog" aria-modal="true" aria-label="Adicionar cartão">
        <div className="sheet-handle"/>
        <div className="eyebrow">Cartão de crédito</div>
        <h2>Como funciona essa fatura?</h2>
        <p>Sem número completo do cartão. Só guardamos o necessário para organizar fechamento, vencimento, compras e parcelas.</p>

        <label className="field-label" htmlFor="card-name">Nome do cartão</label>
        <input id="card-name" className="premium-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Nubank Ultravioleta" maxLength={60}/>

        <label className="field-label">Bandeira</label>
        <div className="card-brand-grid">
          {CARD_BRANDS.map(value=><button key={value} type="button" className={brand===value?'brand-choice active':'brand-choice'} onClick={()=>setBrand(value)}>
            {brandLabel[value]}
          </button>)}
        </div>

        <div className="card-form-grid">
          <div>
            <label className="field-label" htmlFor="card-closing">Fecha dia</label>
            <input id="card-closing" className="premium-input" inputMode="numeric" value={closingDay} onChange={e=>setClosingDay(e.target.value.replace(/\D/g,'').slice(0,2))}/>
          </div>
          <div>
            <label className="field-label" htmlFor="card-due">Vence dia</label>
            <input id="card-due" className="premium-input" inputMode="numeric" value={dueDay} onChange={e=>setDueDay(e.target.value.replace(/\D/g,'').slice(0,2))}/>
          </div>
        </div>

        <label className="field-label" htmlFor="card-limit">Limite total <span className="optional-field">opcional</span></label>
        <div className="money-input-wrap"><span>R$</span><input id="card-limit" inputMode="decimal" value={limit} onChange={e=>setLimit(e.target.value)} placeholder="0,00"/></div>

        <label className="field-label" htmlFor="card-last4">Últimos 4 dígitos <span className="optional-field">opcional</span></label>
        <input id="card-last4" className="premium-input" inputMode="numeric" autoComplete="off" value={last4} onChange={e=>setLast4(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="1234" maxLength={4}/>
        <small className="field-help">Não informe o número completo. O NestBalance não precisa dele.</small>

        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={saving} onClick={()=>setOpen(false)}>Cancelar</button>
          <button className="primary-button" disabled={saving} onClick={save}>{saving?'Guardando…':'Guardar cartão'}</button>
        </div>
      </section>
    </div>}
  </>;
}
