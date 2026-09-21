import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportedMovements, resolveImportedMovementDirection } from '../.core-dist/core/movement-import.js';

test('print de extrato vira vários movimentos preservando datas',()=>{
  const rows=buildImportedMovements({
    documentType:'bank_screenshot',
    institution:'Mercado Pago',
    overallConfidence:0.95,
    ambiguities:[],
    items:[
      {description:'Padaria',amountMinor:1890,direction:'expense',dateIso:'2026-09-20',confidence:0.97,needsReview:false,visibleText:'Padaria -18,90'},
      {description:'Pix recebido',amountMinor:250000,direction:'income',dateIso:'2026-09-19',confidence:0.96,needsReview:false,visibleText:'Pix recebido +2500,00'}
    ]
  });
  assert.equal(rows.length,2);
  assert.equal(rows[0].direction,'expense');
  assert.equal(rows[0].occurredOn,'2026-09-20');
  assert.equal(rows[1].direction,'income');
});

test('direção ambígua nunca fica silenciosamente confirmada',()=>{
  const [row]=buildImportedMovements({
    documentType:'transaction_list',
    institution:null,
    overallConfidence:0.7,
    ambiguities:['direção não visível'],
    items:[
      {description:'Loja',amountMinor:5000,direction:'unknown',dateIso:null,confidence:0.7,needsReview:true,visibleText:'Loja 50,00'}
    ]
  });
  assert.ok(row.needsReview.includes('direction'));
  const resolved=resolveImportedMovementDirection(row,'expense');
  assert.equal(resolved.direction,'expense');
  assert.ok(!resolved.needsReview.includes('direction'));
});
