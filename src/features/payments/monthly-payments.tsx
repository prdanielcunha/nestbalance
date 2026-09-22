'use client';
import { useMemo, useState } from 'react';
import type { HomeRow } from '@/src/lib/repositories/home';
import { payCommitment, undoCommitmentPayment } from '@/src/lib/repositories/commitment-payments';
import { useAppLocale } from '@/src/i18n/locale-provider';

const copy={
  'pt-BR':{
    title:'Para pagar este mês',allGood:'Tudo certo por aqui',still:'ainda',oneLeft:'falta',manyLeft:'faltam',
    paidMonth:'Pago este mês',day:'Dia',noDay:'Sem dia definido',personal:'Só para mim',
    nextInstallment:'Próxima: parcela',installment:'Parcela',of:'de',monthly:'Repete todo mês',
    paid:'Pago',undo:'Desfazer',undoing:'Desfazendo…',mark:'Paguei',marking:'Marcando…',read:'Consulta',
    undoLater:'Não dá para desfazer este mês porque já existe um pagamento posterior.',
    undoError:'Não conseguimos desfazer agora. O pagamento continua registrado.',
    payError:'Não conseguimos marcar como pago agora. Nada foi duplicado.'
  },
  en:{
    title:'To pay this month',allGood:'All clear here',still:'still',oneLeft:'left',manyLeft:'left',
    paidMonth:'Paid this month',day:'Day',noDay:'No due day set',personal:'Just me',
    nextInstallment:'Next: installment',installment:'Installment',of:'of',monthly:'Repeats every month',
    paid:'Paid',undo:'Undo',undoing:'Undoing…',mark:'Paid it',marking:'Marking…',read:'View only',
    undoLater:'This month cannot be undone because a later payment already exists.',
    undoError:'We could not undo it now. The payment is still recorded.',
    payError:'We could not mark it as paid now. Nothing was duplicated.'
  },
  es:{
    title:'Para pagar este mes',allGood:'Todo en orden por aquí',still:'todavía',oneLeft:'falta',manyLeft:'faltan',
    paidMonth:'Pagado este mes',day:'Día',noDay:'Sin día definido',personal:'Solo yo',
    nextInstallment:'Próxima: cuota',installment:'Cuota',of:'de',monthly:'Se repite cada mes',
    paid:'Pagado',undo:'Deshacer',undoing:'Deshaciendo…',mark:'Ya pagué',marking:'Marcando…',read:'Solo consulta',
    undoLater:'No se puede deshacer este mes porque ya existe un pago posterior.',
    undoError:'No pudimos deshacerlo ahora. El pago sigue registrado.',
    payError:'No pudimos marcarlo como pagado ahora. Nada se duplicó.'
  }
} as const;

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
  const {locale,money}=useAppLocale();
  const c=copy[locale];
  const [workingId,setWorkingId]=useState('');
  const [error,setError]=useState('');

  const items=useMemo(()=>commitments
    .filter(item=>item.status!=='cancelled'&&item.status!=='paid')
    .sort((a,b)=>(a.paidThisMonth?1:0)-(b.paidThisMonth?1:0)||(Number(a.dueDay||99)-Number(b.dueDay||99)))
    .slice(0,8)
  ,[commitments]);

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
      setError(code==='PAYMENT_UNDO_BLOCKED_BY_LATER_PAYMENT'?c.undoLater:c.undoError);
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
      setError(c.payError);
    }finally{
      setWorkingId('');
    }
  }

  if(!items.length) return null;
  const pending=items.filter(item=>!item.paidThisMonth).length;

  return <section id="monthly-payments" className="monthly-payments-section">
    <div className="section-title">
      <div><h2>{c.title}</h2><span>{pending ? `${pending} ${c.still} ${pending===1?c.oneLeft:c.manyLeft}` : c.allGood}</span></div>
    </div>
    <div className="monthly-payment-list">
      {items.map(item=><article className={item.paidThisMonth?'monthly-payment-row paid':'monthly-payment-row'} key={item.id}>
        <div className="monthly-payment-main">
          <span>{item.paidThisMonth?c.paidMonth:item.dueDay?`${c.day} ${item.dueDay}`:c.noDay}{item.scope==='personal'&&<em className="personal-pill">{c.personal}</em>}</span>
          <strong>{item.description}</strong>
          {item.installment&&<small>{item.paidThisMonth?c.nextInstallment:c.installment} {item.installment.current} {c.of} {item.installment.total}</small>}
          {item.recurring&&<small>{c.monthly}</small>}
        </div>
        <div className="monthly-payment-action">
          <b>{money.format(item.amountMinor/100)}</b>
          {canContribute
            ? item.paidThisMonth
              ? <div className="paid-actions">
                  <span className="paid-pill">{c.paid}</span>
                  <button className="undo-paid-button" type="button" disabled={Boolean(workingId)} onClick={()=>void undoPaid(item)}>
                    {workingId===item.id?c.undoing:c.undo}
                  </button>
                </div>
              : <button type="button" disabled={Boolean(workingId)} onClick={()=>void markPaid(item)}>
                  {workingId===item.id?c.marking:c.mark}
                </button>
            : <span className={item.paidThisMonth?'paid-pill':'role-pill'}>{item.paidThisMonth?c.paid:c.read}</span>}
        </div>
      </article>)}
    </div>
    {error&&<p className="error-copy" role="alert">{error}</p>}
  </section>;
}
