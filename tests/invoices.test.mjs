import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceText } from '../.core-dist/core/invoices.js';

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
