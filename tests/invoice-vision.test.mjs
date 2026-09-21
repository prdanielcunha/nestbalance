import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceVisionPreview } from '../.core-dist/core/invoice-vision.js';

test('visão de fatura preserva múltiplas compras e parcelas',()=>{
  const preview=buildInvoiceVisionPreview({
    extraction:{
      dueOn:'2026-09-14',
      statementTotalMinor:21980,
      overallConfidence:0.96,
      ambiguities:[],
      items:[
        {description:'Mercado',amountMinor:12990,purchaseOn:'2026-09-05',installment:null,kind:'purchase',confidence:0.98,needsReview:false,visibleText:'05/09 Mercado 129,90'},
        {description:'Loja XPTO',amountMinor:8990,purchaseOn:'2026-07-02',installment:{current:3,total:10},kind:'purchase',confidence:0.96,needsReview:false,visibleText:'02/07 Loja XPTO 03/10 89,90'}
      ]
    },
    closingDay:7,
    dueDay:14,
    referenceDate:'2026-09-10'
  });

  assert.equal(preview.parserVersion,'invoice-vision-v1');
  assert.equal(preview.items.length,2);
  assert.equal(preview.observedMinor,21980);
  assert.equal(preview.reconciliationDeltaMinor,0);
  assert.equal(preview.globalNeedsReview.length,0);
  assert.equal(preview.items[1].schedule.length,8);
});

test('diferença entre total visível e itens reconhecidos bloqueia confirmação total',()=>{
  const preview=buildInvoiceVisionPreview({
    extraction:{
      dueOn:'2026-09-14',
      statementTotalMinor:30000,
      overallConfidence:0.97,
      ambiguities:[],
      items:[
        {description:'Mercado',amountMinor:12990,purchaseOn:'2026-09-05',installment:null,kind:'purchase',confidence:0.98,needsReview:false,visibleText:'05/09 Mercado 129,90'}
      ]
    },
    closingDay:7,
    dueDay:14,
    referenceDate:'2026-09-10'
  });

  assert.deepEqual(preview.globalNeedsReview,['statement_total_mismatch']);
  assert.equal(preview.reviewCount,1);
  assert.equal(preview.reconciliationDeltaMinor,17010);
});

test('item visual incerto continua revisável e nunca ganha data inventada',()=>{
  const preview=buildInvoiceVisionPreview({
    extraction:{
      dueOn:null,
      statementTotalMinor:null,
      overallConfidence:0.8,
      ambiguities:['data pouco legível'],
      items:[
        {description:'Streaming',amountMinor:3990,purchaseOn:null,installment:null,kind:'purchase',confidence:0.72,needsReview:true,visibleText:'Streaming 39,90'}
      ]
    },
    closingDay:7,
    dueDay:14,
    referenceDate:'2026-09-10'
  });

  assert.equal(preview.items[0].purchaseOn,null);
  assert.ok(preview.items[0].needsReview.includes('purchase_date'));
  assert.ok(preview.items[0].needsReview.includes('visual_item'));
  assert.ok(preview.globalNeedsReview.includes('visual_invoice'));
});
