import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCashView } from '../.core-dist/core/cash-view.js';

test('compra de cartão não vira dinheiro já pago',()=>{
  const view=deriveCashView({
    transactions:[
      {amountMinor:12990,direction:'expense',source:'credit_card_invoice',status:'confirmed'},
      {amountMinor:5000,direction:'expense',source:'universal_capture',status:'confirmed'}
    ],
    commitments:[],
    invoices:[]
  });
  assert.equal(view.paidExpenseMinor,5000);
});

test('fatura aberta entra como obrigação futura conhecida',()=>{
  const view=deriveCashView({
    transactions:[],
    commitments:[{amountMinor:11990,status:'pending'}],
    invoices:[{confirmedAmountMinor:25000,paymentStatus:'unpaid',status:'confirmed'}]
  });
  assert.equal(view.knownCommitmentsMinor,11990);
  assert.equal(view.openCardInvoicesMinor,25000);
  assert.equal(view.futureCommitmentsMinor,36990);
});

test('pagamento da fatura remove obrigação sem criar nova despesa',()=>{
  const view=deriveCashView({
    transactions:[
      {amountMinor:25000,direction:'transfer',source:'credit_card_invoice_payment',status:'confirmed'}
    ],
    commitments:[],
    invoices:[{confirmedAmountMinor:25000,paidAmountMinor:25000,paymentStatus:'paid',status:'confirmed'}]
  });
  assert.equal(view.paidExpenseMinor,0);
  assert.equal(view.openCardInvoicesMinor,0);
  assert.equal(view.futureCommitmentsMinor,0);
});

test('fatura parcialmente conhecida conta apenas valor confirmado',()=>{
  const view=deriveCashView({
    transactions:[],
    commitments:[],
    invoices:[{confirmedAmountMinor:14990,paymentStatus:'unpaid',status:'partial'}]
  });
  assert.equal(view.openCardInvoicesMinor,14990);
});
