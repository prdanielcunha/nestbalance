'use client';
import { useEffect, useState } from 'react';
import { CARD_BRANDS, invoiceCycleForPurchase, type CardBrand } from '@/src/core/cards';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { createHouseholdCreditCard } from '@/src/lib/repositories/cards';
import { InvoiceImportSheet } from '@/src/features/cards/invoice-import-sheet';
import { InvoicePaymentSheet } from '@/src/features/cards/invoice-payment-sheet';
import type { HomeAccount, HomeCardSnapshot, HomeCreditCard, HomeInvoiceImport } from '@/src/lib/repositories/home';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import type { FinancialScope } from '@/src/core/privacy';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const brandLabel:Record<CardBrand,string>={
  visa:'Visa',
  mastercard:'Mastercard',
  elo:'Elo',
  amex:'American Express',
  other:'Outro'
};

function inferBrand(value:string):CardBrand{
  const text=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(text.includes('mastercard')||text.includes('master card')) return 'mastercard';
  if(text.includes('american express')||text.includes('amex')) return 'amex';
  if(/\bvisa\b/.test(text)) return 'visa';
  if(/\belo\b/.test(text)) return 'elo';
  return 'other';
}

function todayIso(){
  const now=new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}

export function CreditCardManager({
  householdId,
  cards,
  accounts,
  invoiceImports,
  suggestedCards=[],
  onCreated,
  canManage=true,
  defaultScope='household'
}:{
  householdId:string;
  cards:HomeCreditCard[];
  accounts:HomeAccount[];
  invoiceImports:HomeInvoiceImport[];
  suggestedCards?:HomeCardSnapshot[];
  onCreated?:()=>void;
  canManage?:boolean;
  defaultScope?:FinancialScope;
}){
  const [open,setOpen]=useState(false);
  const [name,setName]=useState('');
  const [brand,setBrand]=useState<CardBrand>('other');
  const [last4,setLast4]=useState('');
  const [closingDay,setClosingDay]=useState('7');
  const [dueDay,setDueDay]=useState('14');
  const [limit,setLimit]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [prefillNote,setPrefillNote]=useState('');
  const [scope,setScope]=useState<FinancialScope>(defaultScope);
  useEffect(()=>{if(!open)setScope(defaultScope);},[defaultScope,open]);
  const [invoiceCard,setInvoiceCard]=useState<HomeCreditCard|null>(null);
  const [paymentTarget,setPaymentTarget]=useState<{card:HomeCreditCard;invoice:HomeInvoiceImport}|null>(null);

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
        limitMinor,
        scope
      });
      setOpen(false);
      setName('');
      setBrand('other');
      setLast4('');
      setClosingDay('7');
      setDueDay('14');
      setLimit('');
      setScope(defaultScope);
      setPrefillNote('');
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

  const unmatchedSuggestions=suggestedCards.filter(snapshot=>{
    if(snapshot.last4&&cards.some(card=>card.last4===snapshot.last4)) return false;
    const normalized=snapshot.name.trim().toLowerCase();
    return !cards.some(card=>card.name.trim().toLowerCase()===normalized);
  }).slice(0,4);

  function openFromSuggestion(snapshot:HomeCardSnapshot){
    setName(snapshot.name||snapshot.institutionName||'Cartão');
    setBrand(inferBrand([snapshot.name,snapshot.institutionName].filter(Boolean).join(' ')));
    setLast4(snapshot.last4||'');
    if(snapshot.dueOn&&/^\d{4}-\d{2}-\d{2}$/.test(snapshot.dueOn)) setDueDay(String(Number(snapshot.dueOn.slice(8,10))));
    if(snapshot.totalLimitMinor!==null) setLimit((snapshot.totalLimitMinor/100).toFixed(2).replace('.',','));
    setScope(snapshot.scope==='personal'?'personal':defaultScope);
    setPrefillNote('Pré-preenchi o que consegui reconhecer no seu print. Confira fechamento, vencimento e bandeira antes de guardar.');
    setError('');
    setOpen(true);
  }

  return <>
    <section className="cards-section">
      <div className="section-title">
        <div><h2>Cartões</h2><span>faturas e parcelas no lugar certo</span></div>
        {canManage&&<button className="section-action" type="button" onClick={()=>setOpen(true)}>Adicionar cartão</button>}
      </div>

      {canManage&&unmatchedSuggestions.length>0&&<div className="card-suggestion-block">
        <div>
          <span>ENCONTRADO NOS SEUS PRINTS</span>
          <strong>Já dá para aproveitar dados de {unmatchedSuggestions.length===1?'um cartão':'alguns cartões'}.</strong>
          <small>O NestBalance usa somente o que foi reconhecido e pede confirmação do que estiver faltando.</small>
        </div>
        <div className="recognized-card-grid">
          {unmatchedSuggestions.map(snapshot=><article className="recognized-card" key={snapshot.id}>
            <span>{snapshot.institutionName||'Cartão reconhecido'}{snapshot.scope==='personal'&&<em className="personal-pill">Só para mim</em>}</span>
            <h3>{snapshot.name}{snapshot.last4?' · '+snapshot.last4:''}</h3>
            {snapshot.totalLimitMinor!==null&&<small>Limite total: {money.format(snapshot.totalLimitMinor/100)}</small>}
            {snapshot.dueOn&&<small>Vence dia {Number(snapshot.dueOn.slice(8,10))}</small>}
            <button className="section-action" type="button" onClick={()=>openFromSuggestion(snapshot)}>Completar cadastro</button>
          </article>)}
        </div>
      </div>}

      {cards.length===0
        ? canManage
          ? <button className="card-empty" type="button" onClick={()=>setOpen(true)}>
              <span>Cartão de crédito</span>
              <strong>Adicione o cartão antes de importar a primeira fatura.</strong>
              <small>O NestBalance vai usar fechamento e vencimento para entender em qual fatura cada compra entra.</small>
            </button>
          : <div className="card-empty readonly">
              <span>Cartões do Lar</span>
              <strong>Nenhum cartão foi adicionado ainda.</strong>
              <small>Um administrador pode cadastrar cartões e importar faturas.</small>
            </div>
        : <div className="credit-card-grid">
            {cards.map(card=>{
              let cycle:{closingOn:string;dueOn:string;invoiceKey:string}|null=null;
              try{cycle=invoiceCycleForPurchase(todayIso(),card.closingDay,card.dueDay);}catch{}
              const openInvoices=invoiceImports
                .filter(invoice=>invoice.cardId===card.id&&invoice.paymentStatus!=='paid'&&invoice.confirmedAmountMinor>0)
                .sort((a,b)=>String(a.dueOn).localeCompare(String(b.dueOn)));
              const openInvoice=openInvoices[0]||null;
              return <article className="credit-card-tile" key={card.id}>
                <div className="credit-card-top">
                  <span>{brandLabel[card.brand as CardBrand]||'Cartão'}{card.scope==='personal'&&<em className="personal-pill">Só para mim</em>}</span>
                  <b>{card.last4?'•••• '+card.last4:'Crédito'}</b>
                </div>
                <h3>{card.name}</h3>
                <div className="credit-card-meta">
                  <div><span>Fecha</span><strong>dia {card.closingDay}</strong></div>
                  <div><span>Vence</span><strong>dia {card.dueDay}</strong></div>
                  <div><span>Limite</span><strong>{card.limitMinor===null?'Não informado':money.format(card.limitMinor/100)}</strong></div>
                </div>
                {openInvoice
                  ? <div className="card-open-invoice">
                      <span>{openInvoice.status==='confirmed'?'Fatura aberta':'Fatura em revisão'}</span>
                      <strong>{money.format(openInvoice.confirmedAmountMinor/100)}</strong>
                      <small>Vence {new Intl.DateTimeFormat('pt-BR').format(new Date(openInvoice.dueOn+'T12:00:00'))}</small>
                    </div>
                  : cycle&&<small>Compras de hoje entram na fatura com vencimento em {new Intl.DateTimeFormat('pt-BR').format(new Date(cycle.dueOn+'T12:00:00'))}.</small>}
                {canManage&&<div className="card-tile-actions">
                  <button className="invoice-import-button" type="button" onClick={()=>setInvoiceCard(card)}>Importar fatura</button>
                  {openInvoice&&<button
                    className="invoice-pay-button"
                    type="button"
                    disabled={openInvoice.status!=='confirmed'}
                    onClick={()=>setPaymentTarget({card,invoice:openInvoice})}
                  >{openInvoice.status==='confirmed'?'Pagar fatura':'Revisão pendente'}</button>}
                </div>}
              </article>;
            })}
          </div>}
    </section>

    {canManage&&invoiceCard&&<InvoiceImportSheet householdId={householdId} card={invoiceCard} onClose={()=>setInvoiceCard(null)} onCommitted={()=>{onCreated?.();setInvoiceCard(null);}} />}
    {canManage&&paymentTarget&&<InvoicePaymentSheet
      householdId={householdId}
      card={paymentTarget.card}
      invoice={paymentTarget.invoice}
      accounts={accounts}
      onClose={()=>setPaymentTarget(null)}
      onPaid={()=>{onCreated?.();setPaymentTarget(null);}}
    />}

    {canManage&&open&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setOpen(false)}>
      <section className="capture-sheet card-sheet" role="dialog" aria-modal="true" aria-label="Adicionar cartão">
        <div className="sheet-handle"/>
        <div className="eyebrow">Cartão de crédito</div>
        <h2>Como funciona essa fatura?</h2>
        <p>Sem número completo do cartão. Só guardamos o necessário para organizar fechamento, vencimento, compras e parcelas.</p>
        {prefillNote&&<p className="notice-copy" role="status">{prefillNote}</p>}

        <ScopeChoice value={scope} onChange={setScope} disabled={saving}/>

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
          <button className="ghost-button" disabled={saving} onClick={()=>{setOpen(false);setPrefillNote('');}}>Cancelar</button>
          <button className="primary-button" disabled={saving} onClick={save}>{saving?'Guardando…':'Guardar cartão'}</button>
        </div>
      </section>
    </div>}
  </>;
}
