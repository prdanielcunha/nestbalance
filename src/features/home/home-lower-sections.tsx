'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useI18n } from '@/src/i18n/locale-provider';
import type { HomeRow } from '@/src/lib/repositories/home';

type FutureMonth={
  key:string;
  year:number;
  monthIndex:number;
  totalMinor:number;
  itemCount:number;
  installmentsMinor:number;
  fixedMinor:number;
};

export function HomeFutureSection({
  months,
  expandedKey,
  onToggle
}:{
  months:FutureMonth[];
  expandedKey:string|null;
  onToggle:(key:string)=>void;
}){
  const {t,locale,intlLocale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const monthName=useMemo(()=>new Intl.DateTimeFormat(intlLocale,{month:'long'}),[intlLocale]);
  const expanded=months.find(item=>item.key===expandedKey)||null;
  return <section className="future-section">
    <div className="section-title"><h2>{t.nextMonths}</h2><span>{t.committed}</span></div>
    <div className="future-grid">
      {months.map(item=>{
        const label=monthName.format(new Date(item.year,item.monthIndex,1));
        return <button key={item.key} className={expandedKey===item.key?'future-card active':'future-card'} onClick={()=>onToggle(item.key)}>
          <span>{label.charAt(0).toUpperCase()+label.slice(1)}</span>
          <strong>{formatMoney(item.totalMinor)}</strong>
          <small>{item.itemCount ? l(`${item.itemCount} compromisso${item.itemCount>1?'s':''}`,`${item.itemCount} commitment${item.itemCount===1?'':'s'}`,`${item.itemCount} compromiso${item.itemCount===1?'':'s'}`) : t.nothingPlanned}</small>
        </button>;
      })}
    </div>
    {expanded&&<div className="future-breakdown" role="status">
      <div><span>{t.installments}</span><strong>{formatMoney(expanded.installmentsMinor)}</strong></div>
      <div><span>{t.repeatingBills}</span><strong>{formatMoney(expanded.fixedMinor)}</strong></div>
      <p>{l('É uma projeção com o que já foi confirmado. O NestBalance não presume recorrência só porque existe uma data de vencimento.','This forecast uses only confirmed information. NestBalance does not assume recurrence just because a due date exists.','Esta previsión usa solo información confirmada. NestBalance no supone recurrencia solo porque exista una fecha de vencimiento.')}</p>
    </div>}
  </section>;
}

export function HomeTimelineSection({transactions}:{transactions:HomeRow[]}){
  const {t,locale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  return <section className="timeline-section">
    <div className="section-title"><h2>{t.movements}</h2><span>{t.timeline}</span></div>
    <div className="timeline">{transactions.slice(0,8).map(item=><article key={item.id} className="timeline-row">
      <div className={`movement-dot ${item.direction==='income'?'in':''}`}/>
      <div>
        <strong>{item.description}</strong>
        <span>{item.source==='credit_card_invoice'?l('No cartão','On card','En tarjeta'):item.source==='credit_card_invoice_payment'?l('Fatura paga','Statement paid','Tarjeta pagada'):item.direction==='income'?t.moneyIn:item.direction==='transfer'?l('Transferência','Transfer','Transferencia'):l('Saiu','Money out','Salió')}</span>
      </div>
      <b>{item.source==='credit_card_invoice'?'•':item.direction==='income'?'+':item.direction==='transfer'?'↔':'−'} {formatMoney(item.amountMinor)}</b>
    </article>)}</div>
  </section>;
}

export function HomeFirstUseGuide(){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  return <section className="first-use-guide">
    <div>
      <span className="section-kicker">{l('PRÓXIMO PASSO','NEXT STEP','SIGUIENTE PASO')}</span>
      <h2>{l('Agora deixe o NestBalance trabalhar por você.','Now let NestBalance start working for you.','Ahora deja que NestBalance empiece a trabajar por ti.')}</h2>
      <p>{l(
        'Seu saldo já está aqui. Traga uma conta, compra ou parcela do jeito mais fácil: escrevendo, colando um print ou falando.',
        'Your balance is already here. Bring in a bill, purchase or installment in the easiest way: type it, paste a screenshot or speak.',
        'Tu saldo ya está aquí. Agrega una cuenta, compra o cuota de la forma más fácil: escribiendo, pegando una captura o hablando.'
      )}</p>
    </div>
    <div className="first-use-actions">
      <Link className="primary-button" href="/add">{l('Enviar print, áudio ou texto','Send screenshot, audio, or text','Enviar captura, audio o texto')}</Link>
      <Link className="ghost-button" href="/accounts">{l('Organizar contas e cartões','Organize accounts and cards','Organizar cuentas y tarjetas')}</Link>
    </div>
    <small>{l(
      'Não precisa configurar tudo hoje. O NestBalance melhora conforme você usa.',
      'You do not need to set everything up today. NestBalance gets better as you use it.',
      'No necesitas configurar todo hoy. NestBalance mejora a medida que lo usas.'
    )}</small>
  </section>;
}

export function HomeMonthSection({
  known,
  incomeMinor,
  paidExpenseMinor,
  futureCommitmentsMinor,
  projectedRemainderMinor,
  hasAccounts
}:{
  known:boolean;
  incomeMinor:number;
  paidExpenseMinor:number;
  futureCommitmentsMinor:number;
  projectedRemainderMinor:number;
  hasAccounts:boolean;
}){
  const {t,locale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  return <section className="month-section">
    <div className="section-title"><div>
      <h2>{t.month}</h2>
      {!known&&<span>{l('Ainda sem dados suficientes para resumir este mês.','Not enough data to summarize this month yet.','Aún no hay datos suficientes para resumir este mes.')}</span>}
    </div></div>
    <div className={known?'month-grid':'month-grid month-grid-unknown'}>
      <div><span>{t.moneyIn}</span><strong>{known?formatMoney(incomeMinor):'—'}</strong></div>
      <div><span>{t.moneyOut}</span><strong>{known?formatMoney(paidExpenseMinor):'—'}</strong></div>
      <div><span>{t.moneyToGo}</span><strong>{known?formatMoney(futureCommitmentsMinor):'—'}</strong></div>
      <div className="projected"><span>{t.projectedLeft}{known&&<small className="estimate-badge">{l('estimado','estimate','estimado')}</small>}</span><strong>{known&&hasAccounts?formatMoney(projectedRemainderMinor):'—'}</strong></div>
    </div>
  </section>;
}
