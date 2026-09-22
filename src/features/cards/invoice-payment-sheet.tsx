'use client';
import { useMemo, useState } from 'react';
import type { HomeAccount, HomeCreditCard, HomeInvoiceImport } from '@/src/lib/repositories/home';
import { payInvoice } from '@/src/lib/repositories/invoices';
import { useI18n } from '@/src/i18n/locale-provider';

export function InvoicePaymentSheet({
  householdId,
  card,
  invoice,
  accounts,
  onClose,
  onPaid
}:{
  householdId:string;
  card:HomeCreditCard;
  invoice:HomeInvoiceImport;
  accounts:HomeAccount[];
  onClose:()=>void;
  onPaid?:()=>void;
}){
  const {locale,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const activeAccounts=useMemo(()=>accounts.filter(account=>account.status==='active'),[accounts]);
  const [accountId,setAccountId]=useState(activeAccounts[0]?.id||'');
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');

  function dueDate(value:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return l('data a conferir','date to review','fecha por revisar');
    return formatDate(new Date(value+'T12:00:00'),{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  async function confirm(){
    if(!accountId||working) return;
    setWorking(true);
    setError('');
    try{
      const result=await payInvoice({
        householdId,
        invoiceImportId:invoice.id,
        accountId
      });
      if(result.status==='duplicate'){
        setError(l(
          'Essa fatura já estava marcada como paga. Nenhuma duplicação foi criada.',
          'This statement was already marked as paid. No duplicate was created.',
          'Este resumen ya estaba marcado como pagado. No se creó ningún duplicado.'
        ));
        onPaid?.();
        return;
      }
      onPaid?.();
      onClose();
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVOICE_NOT_CONFIRMABLE'){
        setError(l(
          'Essa fatura ainda tem itens pendentes de revisão e não pode ser marcada como paga.',
          'This statement still has items pending review and cannot be marked as paid.',
          'Este resumen todavía tiene elementos pendientes de revisión y no puede marcarse como pagado.'
        ));
      }else if(code==='ACCOUNT_NOT_ACTIVE'||code==='ACCOUNT_NOT_FOUND'){
        setError(l('A conta escolhida não está disponível.','The selected account is not available.','La cuenta elegida no está disponible.'));
      }else if(code==='INVOICE_AMOUNT_INVALID'){
        setError(l(
          'O valor confirmado da fatura ainda não está pronto para pagamento.',
          'The confirmed statement amount is not ready for payment yet.',
          'El valor confirmado del resumen todavía no está listo para el pago.'
        ));
      }else{
        setError(l(
          'Não conseguimos registrar o pagamento agora. Nenhuma nova despesa foi criada.',
          'We could not record the payment right now. No new expense was created.',
          'No pudimos registrar el pago ahora. No se creó ningún gasto nuevo.'
        ));
      }
    }finally{
      setWorking(false);
    }
  }

  return <div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!working&&onClose()}>
    <section className="capture-sheet payment-sheet" role="dialog" aria-modal="true" aria-label={l('Pagar fatura','Pay statement','Pagar resumen')}>
      <div className="sheet-handle"/>
      <div className="eyebrow">{l('Liquidar fatura','Settle statement','Liquidar resumen')}</div>
      <h2>{card.name}</h2>
      <p>{l(
        'O pagamento encerra a obrigação da fatura. As compras continuam registradas no cartão e não serão somadas como uma nova despesa.',
        'The payment settles the statement obligation. Card purchases stay recorded and will not be added as a new expense.',
        'El pago liquida la obligación del resumen. Las compras siguen registradas en la tarjeta y no se sumarán como un gasto nuevo.'
      )}</p>

      <div className="payment-invoice-summary">
        <div><span>{l('Fatura','Statement','Resumen')}</span><strong>{invoice.invoiceKey}</strong></div>
        <div><span>{l('Vencimento','Due date','Vencimiento')}</span><strong>{dueDate(invoice.dueOn)}</strong></div>
        <div><span>{l('Valor confirmado','Confirmed amount','Valor confirmado')}</span><strong>{formatMoney(invoice.confirmedAmountMinor)}</strong></div>
      </div>

      <label className="field-label" htmlFor="invoice-payment-account">{l('Saiu de qual conta?','Which account did it come from?','¿De qué cuenta salió?')}</label>
      {activeAccounts.length
        ? <select
            id="invoice-payment-account"
            className="premium-input payment-account-select"
            value={accountId}
            disabled={working}
            onChange={e=>setAccountId(e.target.value)}
          >
            {activeAccounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        : <div className="invoice-empty">
            <strong>{l('Adicione uma conta primeiro.','Add an account first.','Agrega una cuenta primero.')}</strong>
            <span>{l(
              'Precisamos saber de onde a fatura foi paga para registrar a liquidação corretamente.',
              'We need to know which account paid the statement so the settlement is recorded correctly.',
              'Necesitamos saber de qué cuenta se pagó el resumen para registrar correctamente la liquidación.'
            )}</span>
          </div>}

      <div className="payment-semantic-note">
        <strong>{l('Isso não é outra despesa.','This is not another expense.','Esto no es otro gasto.')}</strong>
        <span>{l(
          'O NestBalance registra como transferência da sua conta para a obrigação do cartão.',
          'NestBalance records it as a transfer from your account to the card obligation.',
          'NestBalance lo registra como una transferencia de tu cuenta a la obligación de la tarjeta.'
        )}</span>
      </div>

      {error&&<p className="error-copy" role="alert">{error}</p>}
      <div className="sheet-actions">
        <button className="ghost-button" disabled={working} onClick={onClose}>{l('Cancelar','Cancel','Cancelar')}</button>
        <button className="primary-button" disabled={working||!accountId||invoice.status!=='confirmed'} onClick={confirm}>
          {working?l('Registrando…','Recording…','Registrando…'):l('Marcar fatura como paga','Mark statement as paid','Marcar resumen como pagado')}
        </button>
      </div>
    </section>
  </div>;
}
