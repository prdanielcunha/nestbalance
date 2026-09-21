import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreditCardStatement } from '../.core-dist/core/card-statements.js';

test('extrai múltiplas compras de fatura em texto',()=>{
  const preview=parseCreditCardStatement(
    '05/09 MERCADO CENTRAL 186,40\n06/09 NETFLIX 55,90\n07/09 MAGALU PARC 3/10 129,90',
    '2026-09-14'
  );
  assert.equal(preview.items.length,3);
  assert.equal(preview.currentInvoiceMinor,37220);
  assert.deepEqual(preview.items[2].installment,{current:3,total:10});
});

test('infere ano anterior quando a fatura de janeiro contém compra de dezembro',()=>{
  const preview=parseCreditCardStatement('28/12 FARMACIA 89,90','2027-01-10');
  assert.equal(preview.items[0].observedOn,'2026-12-28');
  assert.equal(preview.items[0].needsReview.includes('purchase_year_inferred'),true);
});

test('ignora linhas de total e limite',()=>{
  const preview=parseCreditCardStatement(
    '05/09 POSTO 200,00\nTOTAL DA FATURA R$ 200,00\nLIMITE DISPONÍVEL R$ 4.800,00',
    '2026-09-14'
  );
  assert.equal(preview.items.length,1);
  assert.equal(preview.items[0].description,'POSTO');
});

test('projeta parcelas futuras a partir da fatura atual',()=>{
  const preview=parseCreditCardStatement('05/09 NOTEBOOK 4/6 350,00','2026-09-14');
  assert.equal(preview.projectedMonths.length,3);
  assert.deepEqual(preview.projectedMonths.map(x=>x.dueOn),['2026-09-14','2026-10-14','2026-11-14']);
  assert.equal(preview.projectedMonths.every(x=>x.totalMinor===35000),true);
});

test('preserva estorno negativo reduzindo a fatura',()=>{
  const preview=parseCreditCardStatement(
    '05/09 COMPRA 100,00\n06/09 ESTORNO -20,00',
    '2026-09-14'
  );
  assert.equal(preview.currentInvoiceMinor,8000);
});
