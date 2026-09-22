import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeInvoiceVisualReview,
  addInvoiceReviewItem,
  removeInvoiceReviewItem,
  updateInvoiceReviewItem,
  validateInvoiceReviewItem
} from '../.core-dist/core/invoice-review.js';

function preview(overrides={}){
  return {
    parserVersion:'invoice-vision-v1',
    invoiceKey:'2026-09',
    dueOn:'2026-09-14',
    dueDateSource:'document',
    items:[
      {
        id:'inv-1',
        sourceLine:'Streaming 39,90',
        description:'Streaming',
        amountMinor:3990,
        purchaseOn:null,
        kind:'purchase',
        installment:null,
        confidence:'medium',
        needsReview:['purchase_date','visual_item'],
        schedule:[]
      }
    ],
    ignoredLines:0,
    reviewCount:2,
    globalNeedsReview:['visual_invoice','statement_total_mismatch'],
    statementTotalMinor:8990,
    reconciliationDeltaMinor:5000,
    observedMinor:3990,
    futureInstallmentsMinor:0,
    ...overrides
  };
}

test('corrigir item remove ambiguidade do item e recalcula totais',()=>{
  const result=updateInvoiceReviewItem({
    preview:preview(),
    itemId:'inv-1',
    draft:{
      description:'Streaming Plus',
      amountMinor:8990,
      purchaseOn:'2026-09-03',
      kind:'purchase',
      installment:null
    }
  });
  assert.equal(result.items[0].needsReview.length,0);
  assert.equal(result.observedMinor,8990);
  assert.equal(result.reconciliationDeltaMinor,0);
  assert.ok(!result.globalNeedsReview.includes('statement_total_mismatch'));
  assert.ok(result.globalNeedsReview.includes('visual_invoice'));
});

test('adicionar item ausente pode fechar reconciliação da fatura',()=>{
  const result=addInvoiceReviewItem({
    preview:preview({
      statementTotalMinor:8990,
      reconciliationDeltaMinor:5000
    }),
    itemId:'manual-1',
    draft:{
      description:'Mercado',
      amountMinor:5000,
      purchaseOn:'2026-09-04',
      kind:'purchase',
      installment:null
    }
  });
  assert.equal(result.items.length,2);
  assert.equal(result.observedMinor,8990);
  assert.equal(result.reconciliationDeltaMinor,0);
});

test('remover falso positivo recalcula diferença contra total visível',()=>{
  const base=preview({
    statementTotalMinor:3990,
    reconciliationDeltaMinor:0,
    items:[
      preview().items[0],
      {
        ...preview().items[0],
        id:'inv-falso',
        description:'Limite disponível',
        amountMinor:50000
      }
    ],
    observedMinor:53990
  });
  const result=removeInvoiceReviewItem({preview:base,itemId:'inv-falso'});
  assert.equal(result.items.length,1);
  assert.equal(result.observedMinor,3990);
  assert.equal(result.reconciliationDeltaMinor,0);
});

test('confirmação humana remove revisão visual mas não ignora diferença matemática',()=>{
  const result=acknowledgeInvoiceVisualReview(preview());
  assert.ok(!result.globalNeedsReview.includes('visual_invoice'));
  assert.ok(result.globalNeedsReview.includes('statement_total_mismatch'));
});

test('validação rejeita parcela impossível',()=>{
  const result=validateInvoiceReviewItem({
    description:'Loja',
    amountMinor:1000,
    purchaseOn:'2026-09-01',
    kind:'purchase',
    installment:{current:7,total:4}
  });
  assert.deepEqual(result,{ok:false,reason:'INVALID_INSTALLMENT'});
});


test('estorno global permanece bloqueando liquidação mesmo após remover o item ambíguo',()=>{
  const base=preview({
    globalNeedsReview:['credit_or_refund_present'],
    items:[{
      ...preview().items[0],
      id:'refund-1',
      description:'Estorno mercado',
      purchaseOn:'2026-09-03',
      needsReview:['credit_or_refund']
    }],
    statementTotalMinor:null,
    reconciliationDeltaMinor:null,
    observedMinor:3990
  });
  const result=removeInvoiceReviewItem({preview:base,itemId:'refund-1'});
  assert.equal(result.items.length,0);
  assert.ok(result.globalNeedsReview.includes('credit_or_refund_present'));
  assert.ok(result.globalNeedsReview.includes('no_invoice_items'));
  assert.ok(result.reviewCount>=2);
});
