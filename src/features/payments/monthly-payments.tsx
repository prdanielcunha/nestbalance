'use client';
import { useMemo, useState } from 'react';
import type { HomeRow } from '@/src/lib/repositories/home';
import { payCommitment, undoCommitmentPayment } from '@/src/lib/repositories/commitment-payments';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

export function MonthlyPayments({
  householdId,
  commitments,
  onChanged
}:{
  householdId:string;
  commitments:HomeRow[];
  onChanged?:()=>void;
}){
  const [workingId,setWorkingId]=useState('');
  const [error,setError]=useState('');

  const items=useMemo(()=>commitments
    .filter(item=>item.status!=='cancelled'&&item.status!=='paid')
    .sort((a,b)=>(a.paidThisMonth?1:0)-(b.paidThisMonth?1:0)||(Number(a.dueDay||99)-Number(b.dueDay||99)))
    .slice(0,8)
  ,[commitments]);

  async function undoPaid(item:HomeRow){
    if(workingId||!item.paidThisMonth) return;
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
        ? 'Não dá para desfazer este mês porque já existe um pagamento posterior.'
        : 'Não conseguimos desfazer agora. O pagamento continua registrado.');
    }finally{
      setWorkingId('');
    }
  }

  async function markPaid(item:HomeRow){
    if(workingId||item.paidThisMonth) return;
    setWorkingId(item.id);
    setError('');
    try{
      await payCommitment({householdId,commitmentId:item.id});
      onChanged?.();
    }catch{
      setError('Não conseguimos marcar como pago agora. Nada foi duplicado.');
    }finally{
      setWorkingId('');
    }
  }

  if(!items.length) return null;

  const pending=items.filter(item=>!item.paidThisMonth).length;

  return <section className="monthly-payments-section">
    <div className="section-title">
      <div><h2>Para pagar este mês</h2><span>{pending ? pending + ' ainda ' + (pending===1?'falta':'faltam') : 'Tudo certo por aqui'}</span></div>
    </div>
    <div className="monthly-payment-list">
      {items.map(item=><article className={item.paidThisMonth?'monthly-payment-row paid':'monthly-payment-row'} key={item.id}>
        <div className="monthly-payment-main">
          <span>{item.paidThisMonth?'Pago este mês':item.dueDay?'Dia '+item.dueDay:'Sem dia definido'}</span>
          <strong>{item.description}</strong>
          {item.installment&&<small>{item.paidThisMonth?'Próxima: parcela ':'Parcela '}{item.installment.current} de {item.installment.total}</small>}
          {item.recurring&&<small>Repete todo mês</small>}
        </div>
        <div className="monthly-payment-action">
          <b>{money.format(item.amountMinor/100)}</b>
          {item.paidThisMonth
            ? <div className="paid-actions">
                <span className="paid-pill">Pago</span>
                <button className="undo-paid-button" type="button" disabled={Boolean(workingId)} onClick={()=>void undoPaid(item)}>
                  {workingId===item.id?'Desfazendo…':'Desfazer'}
                </button>
              </div>
            : <button type="button" disabled={Boolean(workingId)} onClick={()=>void markPaid(item)}>
                {workingId===item.id?'Marcando…':'Paguei'}
              </button>}
        </div>
      </article>)}
    </div>
    {error&&<p className="error-copy" role="alert">{error}</p>}
  </section>;
}
