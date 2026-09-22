'use client';
import { useMemo, useState } from 'react';
import type { HomeRow } from '@/src/lib/repositories/home';
import { payCommitment, undoCommitmentPayment } from '@/src/lib/repositories/commitment-payments';
import { useI18n } from '@/src/i18n/locale-provider';

export function MonthlyPayments({
  householdId,
  commitments,
  onChanged,
  canContribute=true
}:{
  householdId:string;
  commitments:HomeRow[];
  onChanged?:()=>void;
  canContribute?:boolean;
}){
  const {locale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [workingId,setWorkingId]=useState('');
  const [error,setError]=useState('');

  const items=useMemo(()=>{
    const active=commitments
      .filter(item=>item.status!=='cancelled'&&item.status!=='paid')
      .sort((a,b)=>Number(a.dueDay||99)-Number(b.dueDay||99));
    const pending=active.filter(item=>!item.paidThisMonth);
    const paid=active.filter(item=>item.paidThisMonth).slice(0,3);
    return [...pending,...paid];
  },[commitments]);

  async function undoPaid(item:HomeRow){
    if(!canContribute||workingId||!item.paidThisMonth) return;
    setWorkingId(item.id);
    setError('');
    try{
      const now=new Date();
      const periodKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      await undoCommitmentPayment({householdId,commitmentId:item.id,periodKey});
      onChanged?.();
    }catch(err:any){
      const code=String(err?.message||'');
      setError(code==='PAYMENT_UNDO_BLOCKED_BY_LATER_PAYMENT'
        ? l(
            'Não dá para desfazer este mês porque já existe um pagamento posterior.',
            'This month cannot be undone because a later payment already exists.',
            'No se puede deshacer este mes porque ya existe un pago posterior.'
          )
        : l(
            'Não conseguimos desfazer agora. O pagamento continua registrado.',
            'We could not undo it right now. The payment remains recorded.',
            'No pudimos deshacerlo ahora. El pago sigue registrado.'
          ));
    }finally{
      setWorkingId('');
    }
  }

  async function markPaid(item:HomeRow){
    if(!canContribute||workingId||item.paidThisMonth) return;
    setWorkingId(item.id);
    setError('');
    try{
      await payCommitment({householdId,commitmentId:item.id});
      onChanged?.();
    }catch{
      setError(l(
        'Não conseguimos marcar como pago agora. Nada foi duplicado.',
        'We could not mark it paid right now. Nothing was duplicated.',
        'No pudimos marcarlo como pagado ahora. No se duplicó nada.'
      ));
    }finally{
      setWorkingId('');
    }
  }

  if(!items.length) return null;
  const pending=items.filter(item=>!item.paidThisMonth).length;

  return <section id="monthly-payments" className="monthly-payments-section">
    <div className="section-title">
      <div>
        <h2>{l('Para pagar este mês','To pay this month','Para pagar este mes')}</h2>
        <span>{pending
          ? l(
              `${pending} ainda ${pending===1?'falta':'faltam'}`,
              `${pending} still ${pending===1?'needs':'need'} attention`,
              `${pending} todavía ${pending===1?'falta':'faltan'}`
            )
          : l('Tudo certo por aqui','All set here','Todo listo por aquí')}</span>
      </div>
    </div>
    <div className="monthly-payment-list">
      {items.map(item=><article className={item.paidThisMonth?'monthly-payment-row paid':'monthly-payment-row'} key={item.id}>
        <div className="monthly-payment-main">
          <span>
            {item.paidThisMonth
              ? l('Pago este mês','Paid this month','Pagado este mes')
              : item.dueDay
                ? l(`Dia ${item.dueDay}`,`Day ${item.dueDay}`,`Día ${item.dueDay}`)
                : l('Sem dia definido','No due day set','Sin día definido')}
            {item.scope==='personal'&&<em className="personal-pill">{l('Só para mim','Only me','Solo para mí')}</em>}
          </span>
          <strong>{item.description}</strong>
          {item.installment&&<small>
            {item.paidThisMonth
              ? l('Próxima: parcela ','Next: installment ','Siguiente: cuota ')
              : l('Parcela ','Installment ','Cuota ')}
            {item.installment.current} {l('de','of','de')} {item.installment.total}
          </small>}
          {item.recurring&&<small>{l('Repete todo mês','Repeats every month','Se repite cada mes')}</small>}
        </div>
        <div className="monthly-payment-action">
          <b>{formatMoney(item.amountMinor)}</b>
          {canContribute
            ? item.paidThisMonth
              ? <div className="paid-actions">
                  <span className="paid-pill">{l('Pago','Paid','Pagado')}</span>
                  <button className="undo-paid-button" type="button" disabled={Boolean(workingId)} onClick={()=>void undoPaid(item)}>
                    {workingId===item.id
                      ? l('Desfazendo…','Undoing…','Deshaciendo…')
                      : l('Desfazer','Undo','Deshacer')}
                  </button>
                </div>
              : <button type="button" disabled={Boolean(workingId)} onClick={()=>void markPaid(item)}>
                  {workingId===item.id
                    ? l('Marcando…','Marking…','Marcando…')
                    : l('Paguei','I paid','Ya pagué')}
                </button>
            : <span className={item.paidThisMonth?'paid-pill':'role-pill'}>
                {item.paidThisMonth?l('Pago','Paid','Pagado'):l('Consulta','View only','Consulta')}
              </span>}
        </div>
      </article>)}
    </div>
    {error&&<p className="error-copy" role="alert">{error}</p>}
  </section>;
}
