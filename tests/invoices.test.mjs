import test from 'node:test';
import assert from 'node:assert/strict';
import { installmentPlanKey, invoiceItemDedupKey, parseInvoiceText } from '../.core-dist/core/invoices.js';

test('fatura identifica compras, parcela e ignora total/pagamento',()=>{
  const preview=parseInvoiceText({
    text:[
      'Vencimento 14/09/2026',
      '05/09 MERCADO CENTRAL 129,90',
      '06/09 LOJA XPTO PARC 03/10 89,90',
      '07/09 IOF 4,55',
      'PAGAMENTO DA FATURA 500,00',
      'TOTAL DA FATURA 724,35'
    ].join('\n'),
    closingDay:7,
    dueDay:14,
    referenceDate:'2026-09-10'
  });

  assert.equal(preview.dueOn,'2026-09-14');
  assert.equal(preview.dueDateSource,'document');
  assert.equal(preview.invoiceKey,'2026-09');
  assert.equal(preview.items.length,3);
  assert.equal(preview.observedMinor,22435);
  assert.equal(preview.items[1].description,'LOJA XPTO');
  assert.deepEqual(preview.items[1].installment,{current:3,total:10});
  assert.equal(preview.items[1].schedule.length,8);
  assert.equal(preview.items[1].schedule[0].dueOn,'2026-09-14');
  assert.equal(preview.items[1].schedule.at(-1).dueOn,'2027-04-14');
  assert.equal(preview.futureInstallmentsMinor,62930);
  assert.equal(preview.items[2].kind,'fee');
});

test('data curta usa ano mais próximo da referência',()=>{
  const preview=parseInvoiceText({
    text:'28/12 LIVRARIA 45,90',
    closingDay:25,
    dueDay:3,
    referenceDate:'2027-01-02'
  });
  assert.equal(preview.items[0].purchaseOn,'2026-12-28');
});

test('sem vencimento explícito usa ciclo do cartão e pede revisão da parcela',()=>{
  const preview=parseInvoiceText({
    text:'08/09 CURSO ONLINE 02/06 120,00',
    closingDay:7,
    dueDay:14,
    referenceDate:'2026-09-10'
  });
  assert.equal(preview.dueOn,'2026-10-14');
  assert.equal(preview.dueDateSource,'card_cycle');
  assert.equal(preview.reviewCount,1);
  assert.deepEqual(preview.items[0].needsReview,['invoice_due_date']);
});

test('linha sem data é preservada para revisão em vez de inventar data',()=>{
  const preview=parseInvoiceText({
    text:'STREAMING PLUS 39,90',
    closingDay:7,
    dueDay:14,
    referenceDate:'2026-09-10'
  });
  assert.equal(preview.items[0].purchaseOn,null);
  assert.equal(preview.items[0].confidence,'medium');
  assert.deepEqual(preview.items[0].needsReview,['purchase_date']);
});


test('chave de item muda entre parcelas observadas mas é estável na mesma fatura',()=>{
  const item={id:'inv-1-x',description:'LOJA XPTO',amountMinor:8990,purchaseOn:'2026-07-02',installment:{current:3,total:10}};
  const a=invoiceItemDedupKey({cardId:'card-1',invoiceKey:'2026-09',item});
  const b=invoiceItemDedupKey({cardId:'card-1',invoiceKey:'2026-09',item});
  const c=invoiceItemDedupKey({cardId:'card-1',invoiceKey:'2026-10',item:{...item,installment:{current:4,total:10}}});
  assert.equal(a,b);
  assert.notEqual(a,c);
});

test('plano de parcelas permanece o mesmo na fatura seguinte',()=>{
  const first=installmentPlanKey({
    cardId:'card-1',
    item:{description:'Loja Xpto',amountMinor:8990,purchaseOn:'2026-07-02',installment:{current:3,total:10}}
  });
  const next=installmentPlanKey({
    cardId:'card-1',
    item:{description:'LOJA XPTO',amountMinor:8990,purchaseOn:'2026-07-02',installment:{current:4,total:10}}
  });
  assert.equal(first,next);
});


test('estorno ou crédito nunca vira nova despesa confirmada sem revisão',()=>{
  const preview=parseInvoiceText({
    text:[
      'Vencimento 14/09/2026',
      '05/09 MERCADO CENTRAL 129,90',
      '06/09 ESTORNO MERCADO CENTRAL 29,90',
      '07/09 CRÉDITO DE COMPRA LOJA XPTO 50,00'
    ].join('\n'),
    closingDay:7,
    dueDay:14,
    referenceDate:'2026-09-10'
  });
  assert.equal(preview.items.length,3);
  assert.deepEqual(preview.items[0].needsReview,[]);
  assert.ok(preview.items[1].needsReview.includes('credit_or_refund'));
  assert.ok(preview.items[2].needsReview.includes('credit_or_refund'));
  assert.equal(preview.reviewCount,2);
});
