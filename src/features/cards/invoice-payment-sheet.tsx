'use client';
import { useMemo, useState } from 'react';
import type { HomeAccount, HomeCreditCard, HomeInvoiceImport } from '@/src/lib/repositories/home';
import { payInvoice } from '@/src/lib/repositories/invoices';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const date=new Intl.DateTimeFormat('pt-BR');

function formatDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'data a conferir';
  return date.format(new Date(value+'T12:00:00'));
}

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
  const activeAccounts=useMemo(()=>accounts.filter(account=>account.status==='active'),[accounts]);
  const [accountId,setAccountId]=useState(activeAccounts[0]?.id||'');
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');

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
        setError('Essa fatura já estava marcada como paga. Nenhuma duplicação foi criada.');
        onPaid?.();
        return;
      }
      onPaid?.();
      onClose();
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVOICE_NOT_CONFIRMABLE'){
        setError('Essa fatura ainda tem itens pendentes de revisão e não pode ser marcada como paga.');
      }else if(code==='ACCOUNT_NOT_ACTIVE'||code==='ACCOUNT_NOT_FOUND'){
        setError('A conta escolhida não está disponível.');
      }else if(code==='INVOICE_AMOUNT_INVALID'){
        setError('O valor confirmado da fatura ainda não está pronto para pagamento.');
      }else{
        setError('Não conseguimos registrar o pagamento agora. Nenhuma nova despesa foi criada.');
      }
    }finally{
      setWorking(false);
    }
  }

  return <div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!working&&onClose()}>
    <section className="capture-sheet payment-sheet" role="dialog" aria-modal="true" aria-label="Pagar fatura">
      <div className="sheet-handle"/>
      <div className="eyebrow">Liquidar fatura</div>
      <h2>{card.name}</h2>
      <p>O pagamento encerra a obrigação da fatura. As compras continuam registradas no cartão e não serão somadas como uma nova despesa.</p>

      <div className="payment-invoice-summary">
        <div><span>Fatura</span><strong>{invoice.invoiceKey}</strong></div>
        <div><span>Vencimento</span><strong>{formatDate(invoice.dueOn)}</strong></div>
        <div><span>Valor confirmado</span><strong>{money.format(invoice.confirmedAmountMinor/100)}</strong></div>
      </div>

      <label className="field-label" htmlFor="invoice-payment-account">Saiu de qual conta?</label>
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
            <strong>Adicione uma conta primeiro.</strong>
            <span>Precisamos saber de onde a fatura foi paga para registrar a liquidação corretamente.</span>
          </div>}

      <div className="payment-semantic-note">
        <strong>Isso não é outra despesa.</strong>
        <span>O NestBalance registra como transferência da sua conta para a obrigação do cartão.</span>
      </div>

      {error&&<p className="error-copy" role="alert">{error}</p>}
      <div className="sheet-actions">
        <button className="ghost-button" disabled={working} onClick={onClose}>Cancelar</button>
        <button className="primary-button" disabled={working||!accountId||invoice.status!=='confirmed'} onClick={confirm}>
          {working?'Registrando…':'Marcar fatura como paga'}
        </button>
      </div>
    </section>
  </div>;
}
