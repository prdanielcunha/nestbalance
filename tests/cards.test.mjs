import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creditCardDedupKey,
  installmentInvoiceSchedule,
  invoiceCycleForPurchase,
  validateCreditCardDraft
} from '../.core-dist/core/cards.js';

test('cartão válido é normalizado sem guardar número completo',()=>{
  const result=validateCreditCardDraft({
    name:'  Nubank Ultravioleta  ',
    brand:'mastercard',
    closingDay:7,
    dueDay:14,
    last4:'1234',
    limitMinor:2500000
  });
  assert.equal(result.ok,true);
  if(result.ok){
    assert.equal(result.value.name,'Nubank Ultravioleta');
    assert.equal(result.value.last4,'1234');
    assert.equal(result.value.currency,'BRL');
  }
});

test('cartão rejeita quatro últimos dígitos inválidos',()=>{
  assert.deepEqual(
    validateCreditCardDraft({name:'Nubank',brand:'mastercard',closingDay:7,dueDay:14,last4:'12345'}),
    {ok:false,reason:'INVALID_LAST4'}
  );
});

test('dedup usa nome e últimos quatro quando disponíveis',()=>{
  assert.equal(
    creditCardDedupKey(' Nubank ','1234'),
    creditCardDedupKey('nubank','1234')
  );
  assert.notEqual(
    creditCardDedupKey('Nubank','1234'),
    creditCardDedupKey('Nubank','9876')
  );
});

test('compra antes do fechamento entra na fatura corrente',()=>{
  const cycle=invoiceCycleForPurchase('2026-09-05',7,14);
  assert.equal(cycle.closingOn,'2026-09-07');
  assert.equal(cycle.dueOn,'2026-09-14');
  assert.equal(cycle.invoiceKey,'2026-09');
});

test('compra após fechamento vai para a próxima fatura',()=>{
  const cycle=invoiceCycleForPurchase('2026-09-08',7,14);
  assert.equal(cycle.closingOn,'2026-10-07');
  assert.equal(cycle.dueOn,'2026-10-14');
  assert.equal(cycle.invoiceKey,'2026-10');
});

test('vencimento anterior ao fechamento cai no mês seguinte',()=>{
  const cycle=invoiceCycleForPurchase('2026-09-05',25,3);
  assert.equal(cycle.closingOn,'2026-09-25');
  assert.equal(cycle.dueOn,'2026-10-03');
});

test('cronograma de parcelas mantém valor por parcela e respeita parcela atual',()=>{
  const schedule=installmentInvoiceSchedule({
    amountMinor:8990,
    current:3,
    total:6,
    firstDueOn:'2026-09-14'
  });
  assert.deepEqual(schedule.map(x=>x.installmentNumber),[3,4,5,6]);
  assert.deepEqual(schedule.map(x=>x.dueOn),['2026-09-14','2026-10-14','2026-11-14','2026-12-14']);
  assert.equal(schedule.every(x=>x.amountMinor===8990),true);
});


test('fechamento no dia 31 é ajustado ao último dia real do mês',()=>{
  const cycle=invoiceCycleForPurchase('2026-02-20',31,10);
  assert.equal(cycle.closingOn,'2026-02-28');
  assert.equal(cycle.dueOn,'2026-03-10');
});

test('parcelas no dia 31 respeitam fevereiro e ano bissexto sem pular mês',()=>{
  const schedule=installmentInvoiceSchedule({
    amountMinor:10000,
    current:1,
    total:4,
    firstDueOn:'2028-01-31'
  });
  assert.deepEqual(schedule.map(item=>item.dueOn),[
    '2028-01-31',
    '2028-02-29',
    '2028-03-31',
    '2028-04-30'
  ]);
});
