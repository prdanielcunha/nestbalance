'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_BRANDS, invoiceCycleForPurchase, type CardBrand } from '@/src/core/cards';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { createHouseholdCreditCard } from '@/src/lib/repositories/cards';
import { InvoiceImportSheet } from '@/src/features/cards/invoice-import-sheet';
import { InvoicePaymentSheet } from '@/src/features/cards/invoice-payment-sheet';
import type { HomeAccount, HomeCardSnapshot, HomeCreditCard, HomeInvoiceImport } from '@/src/lib/repositories/home';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import type { FinancialScope } from '@/src/core/privacy';
import { readCardImageLocally } from '@/src/lib/local-card-reader';
import { useI18n } from '@/src/i18n/locale-provider';

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
  const {t,locale,intlLocale,currency,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const currencySymbol=useMemo(()=>new Intl.NumberFormat(intlLocale,{style:'currency',currency,currencyDisplay:'narrowSymbol',minimumFractionDigits:0,maximumFractionDigits:0}).formatToParts(0).find(part=>part.type==='currency')?.value||currency,[intlLocale,currency]);
  const brandLabel=useMemo<Record<CardBrand,string>>(()=>({
    visa:'Visa',
    mastercard:'Mastercard',
    elo:'Elo',
    amex:'American Express',
    other:l('Não sei / Outro','Not sure / Other','No sé / Otra')
  }),[locale]);

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
  const [localReading,setLocalReading]=useState(false);
  const [localReadPercent,setLocalReadPercent]=useState(0);
  const cardImageInputRef=useRef<HTMLInputElement|null>(null);
  const [scope,setScope]=useState<FinancialScope>(defaultScope);
  useEffect(()=>{if(!open)setScope(defaultScope);},[defaultScope,open]);
  const [invoiceCard,setInvoiceCard]=useState<HomeCreditCard|null>(null);
  const [paymentTarget,setPaymentTarget]=useState<{card:HomeCreditCard;invoice:HomeInvoiceImport}|null>(null);

  function moneyInput(minor:number){
    return (minor/100).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
  }

  function dayDate(iso:string){
    return formatDate(new Date(iso+'T12:00:00'),{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  async function readLocalImage(file:File){
    if(localReading) return;
    setLocalReading(true);
    setLocalReadPercent(0);
    setError('');
    setPrefillNote('');
    try{
      const result=await readCardImageLocally(file,progress=>setLocalReadPercent(progress.percent));
      if(result.cardName) setName(result.cardName);
      if(result.brand!=='other') setBrand(result.brand);
      if(result.last4) setLast4(result.last4);
      if(result.closingDay!==null) setClosingDay(String(result.closingDay));
      if(result.dueDay!==null) setDueDay(String(result.dueDay));
      if(result.totalLimitMinor!==null) setLimit(moneyInput(result.totalLimitMinor));

      const found=[
        result.cardName?l('banco/nome','bank/name','banco/nombre'):null,
        result.brand!=='other'?l('bandeira','network','marca'):null,
        result.last4?l('últimos 4','last 4','últimos 4'):null,
        result.closingDay!==null?l('fechamento','closing day','cierre'):null,
        result.dueDay!==null?l('vencimento','due date','vencimiento'):null,
        result.totalLimitMinor!==null?l('limite','limit','límite'):null
      ].filter(Boolean);

      setPrefillNote(found.length
        ? l(
            `Lido neste aparelho: ${found.join(', ')}. Confira antes de guardar. A imagem e o número completo não foram enviados ao NestBalance.`,
            `Read on this device: ${found.join(', ')}. Review before saving. The image and full card number were not sent to NestBalance.`,
            `Leído en este dispositivo: ${found.join(', ')}. Revisa antes de guardar. La imagen y el número completo no se enviaron a NestBalance.`
          )
        : l(
            'Não consegui identificar dados suficientes nessa imagem. Você pode preencher manualmente; nada foi enviado ao NestBalance.',
            'I could not identify enough data in this image. You can fill it in manually; nothing was sent to NestBalance.',
            'No pude identificar suficientes datos en esta imagen. Puedes completar manualmente; nada se envió a NestBalance.'
          ));
    }catch{
      setError(l(
        'Não conseguimos ler essa imagem localmente. Você pode tentar outro print ou preencher manualmente.',
        'We could not read this image locally. Try another screenshot or fill the fields manually.',
        'No pudimos leer esta imagen localmente. Prueba otra captura o completa los campos manualmente.'
      ));
    }finally{
      setLocalReading(false);
      setLocalReadPercent(0);
    }
  }

  async function save(){
    const closing=Number(closingDay);
    const due=Number(dueDay);
    const limitMinor=limit.trim()?parseMoneyInputToMinor(limit,locale):null;

    if(name.trim().length<2){
      setError(l('Dê um nome simples para o cartão, como Nubank ou Itaú Platinum.','Give the card a simple name, such as Nubank or Itaú Platinum.','Ponle un nombre simple a la tarjeta, como Nubank o Itaú Platinum.'));
      return;
    }
    if(!Number.isInteger(closing)||closing<1||closing>31){
      setError(l('Informe um dia de fechamento entre 1 e 31.','Enter a closing day between 1 and 31.','Indica un día de cierre entre 1 y 31.'));
      return;
    }
    if(!Number.isInteger(due)||due<1||due>31){
      setError(l('Informe um dia de vencimento entre 1 e 31.','Enter a due day between 1 and 31.','Indica un día de vencimiento entre 1 y 31.'));
      return;
    }
    if(last4.trim()&&!/^\d{4}$/.test(last4.trim())){
      setError(l('Se quiser informar, use somente os 4 últimos dígitos.','If you provide it, use only the last 4 digits.','Si lo informas, usa solo los últimos 4 dígitos.'));
      return;
    }
    if(limitMinor!==null&&limitMinor<0){
      setError(l('O limite do cartão precisa ser zero ou maior.','The card limit must be zero or greater.','El límite de la tarjeta debe ser cero o mayor.'));
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
      if(code==='INVALID_LAST4') setError(l('Os últimos dígitos precisam ter exatamente 4 números.','The last digits must contain exactly 4 numbers.','Los últimos dígitos deben tener exactamente 4 números.'));
      else if(code==='INVALID_CLOSING_DAY'||code==='INVALID_DUE_DAY') setError(l('Confira as datas do cartão.','Check the card dates.','Revisa las fechas de la tarjeta.'));
      else setError(l('Não conseguimos guardar esse cartão agora.','We could not save this card right now.','No pudimos guardar esta tarjeta ahora.'));
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
    setName(snapshot.name||snapshot.institutionName||l('Cartão','Card','Tarjeta'));
    setBrand(inferBrand([snapshot.name,snapshot.institutionName].filter(Boolean).join(' ')));
    setLast4(snapshot.last4||'');
    if(snapshot.dueOn&&/^\d{4}-\d{2}-\d{2}$/.test(snapshot.dueOn)) setDueDay(String(Number(snapshot.dueOn.slice(8,10))));
    if(snapshot.totalLimitMinor!==null) setLimit(moneyInput(snapshot.totalLimitMinor));
    setScope(snapshot.scope==='personal'?'personal':defaultScope);
    setPrefillNote(l(
      'Pré-preenchi o que consegui reconhecer no seu print. Confira fechamento, vencimento e bandeira antes de guardar.',
      'I prefilled what I could recognize in your screenshot. Check the closing day, due date and network before saving.',
      'Precompleté lo que pude reconocer en tu captura. Revisa el cierre, vencimiento y marca antes de guardar.'
    ));
    setError('');
    setOpen(true);
  }

  return <>
    <section className="cards-section">
      <div className="section-title">
        <div><h2>{l('Cartões','Cards','Tarjetas')}</h2><span>{l('faturas e parcelas no lugar certo','statements and installments in the right place','resúmenes y cuotas en el lugar correcto')}</span></div>
        {canManage&&<button className="section-action" type="button" onClick={()=>setOpen(true)}>{l('Adicionar cartão','Add card','Agregar tarjeta')}</button>}
      </div>

      {canManage&&unmatchedSuggestions.length>0&&<div className="card-suggestion-block">
        <div>
          <span>{l('ENCONTRADO NOS SEUS PRINTS','FOUND IN YOUR SCREENSHOTS','ENCONTRADO EN TUS CAPTURAS')}</span>
          <strong>{l(
            `Já dá para aproveitar dados de ${unmatchedSuggestions.length===1?'um cartão':'alguns cartões'}.`,
            `We can already reuse data from ${unmatchedSuggestions.length===1?'one card':'some cards'}.`,
            `Ya podemos aprovechar datos de ${unmatchedSuggestions.length===1?'una tarjeta':'algunas tarjetas'}.`
          )}</strong>
          <small>{l(
            'O NestBalance usa somente o que foi reconhecido e pede confirmação do que estiver faltando.',
            'NestBalance uses only what was recognized and asks you to confirm anything missing.',
            'NestBalance usa solo lo que fue reconocido y pide confirmar lo que falte.'
          )}</small>
        </div>
        <div className="recognized-card-grid">
          {unmatchedSuggestions.map(snapshot=><article className="recognized-card" key={snapshot.id}>
            <span>{snapshot.institutionName||l('Cartão reconhecido','Recognized card','Tarjeta reconocida')}{snapshot.scope==='personal'&&<em className="personal-pill">{t.scopePersonal}</em>}</span>
            <h3>{snapshot.name}{snapshot.last4?' · '+snapshot.last4:''}</h3>
            {snapshot.totalLimitMinor!==null&&<small>{l('Limite total','Total limit','Límite total')}: {formatMoney(snapshot.totalLimitMinor)}</small>}
            {snapshot.dueOn&&<small>{l('Vence dia','Due on day','Vence el día')} {Number(snapshot.dueOn.slice(8,10))}</small>}
            <button className="section-action" type="button" onClick={()=>openFromSuggestion(snapshot)}>{l('Completar cadastro','Complete setup','Completar registro')}</button>
          </article>)}
        </div>
      </div>}

      {cards.length===0
        ? canManage
          ? <button className="card-empty" type="button" onClick={()=>setOpen(true)}>
              <span>{l('Cartão de crédito','Credit card','Tarjeta de crédito')}</span>
              <strong>{l('Adicione o cartão antes de importar a primeira fatura.','Add the card before importing the first statement.','Agrega la tarjeta antes de importar el primer resumen.')}</strong>
              <small>{l(
                'O NestBalance vai usar fechamento e vencimento para entender em qual fatura cada compra entra.',
                'NestBalance uses the closing and due dates to understand which statement each purchase belongs to.',
                'NestBalance usa el cierre y el vencimiento para entender en qué resumen entra cada compra.'
              )}</small>
            </button>
          : <div className="card-empty readonly">
              <span>{l('Cartões do Lar','Household cards','Tarjetas del Hogar')}</span>
              <strong>{l('Nenhum cartão foi adicionado ainda.','No card has been added yet.','Todavía no se agregó ninguna tarjeta.')}</strong>
              <small>{l('Um administrador pode cadastrar cartões e importar faturas.','An administrator can add cards and import statements.','Un administrador puede agregar tarjetas e importar resúmenes.')}</small>
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
                  <span>{brandLabel[card.brand as CardBrand]||l('Cartão','Card','Tarjeta')}{card.scope==='personal'&&<em className="personal-pill">{t.scopePersonal}</em>}</span>
                  <b>{card.last4?'•••• '+card.last4:l('Crédito','Credit','Crédito')}</b>
                </div>
                <h3>{card.name}</h3>
                <div className="credit-card-meta">
                  <div><span>{l('Fecha','Closes','Cierra')}</span><strong>{l('dia','day','día')} {card.closingDay}</strong></div>
                  <div><span>{l('Vence','Due','Vence')}</span><strong>{l('dia','day','día')} {card.dueDay}</strong></div>
                  <div><span>{l('Limite','Limit','Límite')}</span><strong>{card.limitMinor===null?l('Não informado','Not provided','No informado'):formatMoney(card.limitMinor)}</strong></div>
                </div>
                {openInvoice
                  ? <div className="card-open-invoice">
                      <span>{openInvoice.status==='confirmed'?l('Fatura aberta','Open statement','Resumen abierto'):l('Fatura em revisão','Statement under review','Resumen en revisión')}</span>
                      <strong>{formatMoney(openInvoice.confirmedAmountMinor)}</strong>
                      <small>{l('Vence','Due','Vence')} {dayDate(openInvoice.dueOn)}</small>
                    </div>
                  : cycle&&<small>{l(
                      `Compras de hoje entram na fatura com vencimento em ${dayDate(cycle.dueOn)}.`,
                      `Purchases made today go to the statement due ${dayDate(cycle.dueOn)}.`,
                      `Las compras de hoy entran en el resumen que vence ${dayDate(cycle.dueOn)}.`
                    )}</small>}
                {canManage&&<div className="card-tile-actions">
                  <button className="invoice-import-button" type="button" onClick={()=>setInvoiceCard(card)}>{l('Importar fatura','Import statement','Importar resumen')}</button>
                  {openInvoice&&<button
                    className="invoice-pay-button"
                    type="button"
                    disabled={openInvoice.status!=='confirmed'}
                    onClick={()=>setPaymentTarget({card,invoice:openInvoice})}
                  >{openInvoice.status==='confirmed'?l('Pagar fatura','Pay statement','Pagar resumen'):l('Revisão pendente','Review pending','Revisión pendiente')}</button>}
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
      <section className="capture-sheet card-sheet" role="dialog" aria-modal="true" aria-label={l('Adicionar cartão','Add card','Agregar tarjeta')}>
        <div className="sheet-handle"/>
        <div className="eyebrow">{l('Cartão de crédito','Credit card','Tarjeta de crédito')}</div>
        <h2>{l('Como funciona essa fatura?','How does this statement work?','¿Cómo funciona este resumen?')}</h2>
        <p>{l(
          'Sem número completo do cartão. Só guardamos o necessário para organizar fechamento, vencimento, compras e parcelas.',
          'No full card number. We store only what is needed to organize closing date, due date, purchases and installments.',
          'Sin número completo de la tarjeta. Solo guardamos lo necesario para organizar cierre, vencimiento, compras y cuotas.'
        )}</p>
        {prefillNote&&<p className="notice-copy" role="status">{prefillNote}</p>}

        <div className="local-card-reader">
          <div>
            <strong>{l('Tem um print ou foto do cartão?','Do you have a screenshot or photo of the card?','¿Tienes una captura o foto de la tarjeta?')}</strong>
            <span>{l(
              'Lemos no seu aparelho para tentar preencher banco, bandeira, últimos 4, vencimento e limite. A imagem não é enviada neste passo.',
              'We read it on your device to try to fill bank, network, last 4 digits, due date and limit. The image is not uploaded in this step.',
              'La leemos en tu dispositivo para intentar completar banco, marca, últimos 4, vencimiento y límite. La imagen no se envía en este paso.'
            )}</span>
          </div>
          <button type="button" disabled={saving||localReading} onClick={()=>cardImageInputRef.current?.click()}>
            {localReading?l(`Lendo no aparelho… ${localReadPercent}%`,`Reading on device… ${localReadPercent}%`,`Leyendo en el dispositivo… ${localReadPercent}%`):l('Ler foto ou print','Read photo or screenshot','Leer foto o captura')}
          </button>
          <input
            ref={cardImageInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={saving||localReading}
            onChange={e=>{
              const selected=e.target.files?.[0];
              if(selected) void readLocalImage(selected);
              e.currentTarget.value='';
            }}
          />
          <small>{l(
            'Na primeira leitura, o navegador pode baixar o mecanismo de OCR. O processamento da imagem acontece localmente.',
            'On the first read, the browser may download the OCR engine. Image processing happens locally.',
            'En la primera lectura, el navegador puede descargar el motor OCR. El procesamiento de la imagen ocurre localmente.'
          )}</small>
        </div>

        <ScopeChoice value={scope} onChange={setScope} disabled={saving||localReading}/>

        <label className="field-label" htmlFor="card-name">{l('Nome do cartão','Card name','Nombre de la tarjeta')}</label>
        <input id="card-name" className="premium-input" value={name} onChange={e=>{const next=e.target.value;setName(next);const detected=inferBrand(next);if(detected!=='other')setBrand(detected);}} placeholder={l('Ex.: Nubank Ultravioleta','E.g. Nubank Ultravioleta','Ej.: Nubank Ultravioleta')} maxLength={60}/>

        <label className="field-label">{l('Bandeira','Card network','Marca')}</label>
        <div className="card-brand-grid">
          {CARD_BRANDS.map(value=><button key={value} type="button" className={brand===value?'brand-choice active':'brand-choice'} onClick={()=>setBrand(value)}>
            {brandLabel[value]}
          </button>)}
        </div>
        <small className="field-help">{l(
          'Não chutamos a bandeira. Se o nome ou um print permitir identificar com segurança, ela é preenchida; caso contrário, você confirma.',
          'We do not guess the card network. If the name or screenshot identifies it reliably, it is filled in; otherwise you confirm it.',
          'No adivinamos la marca. Si el nombre o una captura permite identificarla con seguridad, se completa; de lo contrario, tú la confirmas.'
        )}</small>

        <div className="card-form-grid">
          <div>
            <label className="field-label" htmlFor="card-closing">{l('Fecha dia','Closing day','Cierra el día')}</label>
            <input id="card-closing" className="premium-input" inputMode="numeric" value={closingDay} onChange={e=>setClosingDay(e.target.value.replace(/\D/g,'').slice(0,2))}/>
          </div>
          <div>
            <label className="field-label" htmlFor="card-due">{l('Vence dia','Due day','Vence el día')}</label>
            <input id="card-due" className="premium-input" inputMode="numeric" value={dueDay} onChange={e=>setDueDay(e.target.value.replace(/\D/g,'').slice(0,2))}/>
          </div>
        </div>

        <label className="field-label" htmlFor="card-limit">{l('Limite total','Total limit','Límite total')} <span className="optional-field">{l('opcional','optional','opcional')}</span></label>
        <div className="money-input-wrap"><span>{currencySymbol}</span><input id="card-limit" inputMode="decimal" value={limit} onChange={e=>setLimit(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>

        <label className="field-label" htmlFor="card-last4">{l('Últimos 4 dígitos','Last 4 digits','Últimos 4 dígitos')} <span className="optional-field">{l('opcional','optional','opcional')}</span></label>
        <input id="card-last4" className="premium-input" inputMode="numeric" autoComplete="off" value={last4} onChange={e=>setLast4(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="1234" maxLength={4}/>
        <small className="field-help">{l('Não informe o número completo. O NestBalance não precisa dele.','Do not enter the full number. NestBalance does not need it.','No informes el número completo. NestBalance no lo necesita.')}</small>

        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={saving||localReading} onClick={()=>{setOpen(false);setPrefillNote('');}}>{l('Cancelar','Cancel','Cancelar')}</button>
          <button className="primary-button" disabled={saving||localReading} onClick={save}>{saving?l('Guardando…','Saving…','Guardando…'):l('Guardar cartão','Save card','Guardar tarjeta')}</button>
        </div>
      </section>
    </div>}
  </>;
}
