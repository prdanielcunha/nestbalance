import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveBalanceComposition} from '../.core-dist/core/balance-composition.js';
const account={id:'account1',balanceMinor:500000,currency:'BRL',status:'active',balanceCoverage:'includes_pots',includedSavingsMinor:200000};
const pot={id:'pot1',balanceMinor:200000,currency:'BRL',status:'active'};
test('separates savings already included in an account without counting twice',()=>{
  const c=deriveBalanceComposition([account],[pot]);
  assert.equal(c.outsideMinor,300000);assert.equal(c.savedMinor,200000);
});
test('does not subtract savings from an account that excludes pots',()=>{
  assert.equal(deriveBalanceComposition([{...account,balanceCoverage:'excludes_pots'}],[pot]).outsideMinor,500000);
});
test('unknown coverage or absent balance stays unknown, including an investment-only view',()=>{
  for(const a of [{...account,balanceCoverage:'unknown'},{...account,balanceMinor:null},{...account,includedSavingsMinor:600000},{...account,connectedProductType:'investment'}]) assert.equal(deriveBalanceComposition([a],[pot]).outsideMinor,null);
});
test('never combines currencies or archived sources and detects stale balances',()=>{
  const c=deriveBalanceComposition([account,{...account,id:'dollar',currency:'USD'}],[pot,{...pot,id:'archived',status:'archived'}]);
  assert.equal(c.savedMinor,200000);assert.deepEqual(c.otherCurrencies,['USD']);assert.equal(c.stale,true);
});
