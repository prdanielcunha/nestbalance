import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReviewedInterpretation } from '../.core-dist/core/capture-review.js';

const base={
  kind:'transaction',
  description:'Mercado',
  money:{currency:'BRL',amountMinor:1000},
  direction:'expense',
  recurring:false,
  confidence:'medium',
  fieldConfidence:{description:.6,amount:.8,direction:.6},
  sourceText:'mercado 10',
  parserVersion:'text-v0.1',
  needsReview:['direction']
};

test('reviewed capture fields become authoritative only after validation',()=>{
  const result=applyReviewedInterpretation(base,{
    kind:'transaction',
    description:'Mercado central',
    amountMinor:1250,
    direction:'expense',
    recurring:false
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.description,'Mercado central');
  assert.equal(result.value.money.amountMinor,1250);
  assert.deepEqual(result.value.needsReview,[]);
  assert.equal(result.value.confidence,'high');
});

test('review rejects invalid amount and kind changes',()=>{
  assert.equal(applyReviewedInterpretation(base,{kind:'commitment',description:'x',amountMinor:1,direction:'expense'}).ok,false);
  assert.equal(applyReviewedInterpretation(base,{kind:'transaction',description:'Mercado',amountMinor:-1,direction:'expense'}).ok,false);
});
