import test from 'node:test';
import assert from 'node:assert/strict';
import { cardCommitmentsForWindow, projectStoredCardPurchases } from '../.core-dist/core/card-purchase-projection.js';

test('compra à vista aparece apenas na fatura de origem',()=>{
  const result=projectStoredCardPurchases([
    {cardId:'card-a',amountMinor:12000,invoiceDueOn:'2026-09-14',installment:null,status:'confirmed'}
  ]);
  assert.deepEqual(result.map(x=>[x.dueOn,x.totalMinor]),[['2026-09-14',12000]]);
});

test('parcela importada projeta apenas o que ainda falta',()=>{
  const result=projectStoredCardPurchases([
    {cardId:'card-a',amountMinor:35000,invoiceDueOn:'2026-09-14',installment:{current:4,total:6},status:'confirmed'}
  ]);
  assert.deepEqual(
    result.map(x=>[x.dueOn,x.totalMinor]),
    [['2026-09-14',35000],['2026-10-14',35000],['2026-11-14',35000]]
  );
});

test('duas compras do mesmo cartão e vencimento são agregadas',()=>{
  const result=projectStoredCardPurchases([
    {cardId:'card-a',amountMinor:10000,invoiceDueOn:'2026-09-14'},
    {cardId:'card-a',amountMinor:5000,invoiceDueOn:'2026-09-14'}
  ]);
  assert.equal(result.length,1);
  assert.equal(result[0].totalMinor,15000);
  assert.equal(result[0].itemCount,2);
});

test('estorno reduz projeção da fatura',()=>{
  const result=projectStoredCardPurchases([
    {cardId:'card-a',amountMinor:10000,invoiceDueOn:'2026-09-14'},
    {cardId:'card-a',amountMinor:-2000,invoiceDueOn:'2026-09-14'}
  ]);
  assert.equal(result[0].totalMinor,8000);
});

test('liquidação remove compra da projeção sem apagar histórico',()=>{
  const result=projectStoredCardPurchases([
    {cardId:'card-a',amountMinor:10000,invoiceDueOn:'2026-09-14',status:'settled'}
  ]);
  assert.equal(result.length,0);
});

test('janela soma somente faturas dentro do período',()=>{
  const purchases=[
    {cardId:'card-a',amountMinor:10000,invoiceDueOn:'2026-09-14'},
    {cardId:'card-b',amountMinor:20000,invoiceDueOn:'2026-10-10'}
  ];
  assert.equal(cardCommitmentsForWindow(purchases,'2026-09-01','2026-09-30'),10000);
});
