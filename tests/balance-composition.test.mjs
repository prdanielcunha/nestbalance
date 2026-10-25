import test from 'node:test';
import assert from 'node:assert/strict';
import {maskMoneyInText} from '../.core-dist/core/value-privacy.js';
import {deriveBalanceComposition,deriveSpendingAvailability} from '../.core-dist/core/balance-composition.js';
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


test('a newly uploaded old screenshot retains its observation age',()=>{
 const now=Date.UTC(2026,9,25,12);
 const c=deriveBalanceComposition([{...account,balanceAsOfMs:now,observedOn:'2026-09-20'}],[{...pot,updatedAtMs:now,observedOn:'2026-09-20'}],'BRL',now);
 assert.equal(c.stale,true);assert.equal(c.rows[0].stale,true);
});


test('unknown coverage preserves reported balances without claiming they exclude savings',()=>{
 const c=deriveBalanceComposition([{...account,balanceCoverage:'unknown'}],[pot]);
 assert.equal(c.outsideMinor,null);assert.equal(c.reportedMinor,500000);
 assert.equal(c.provisionalOutsideMinor,500000);assert.equal(c.pendingCount,1);
 assert.deepEqual(deriveSpendingAvailability(c,120000),{amountMinor:380000,shortfallMinor:0,provisional:true,commitmentsMinor:120000});
});
test('mixed coverage subtracts confirmed savings once in the provisional spending ceiling',()=>{
 const c=deriveBalanceComposition([account,{...account,id:'other',balanceCoverage:'unknown',balanceMinor:100000}],[pot]);
 assert.equal(c.reportedMinor,600000);assert.equal(c.provisionalOutsideMinor,400000);
 assert.equal(deriveSpendingAvailability(c,50000).amountMinor,350000);
 assert.equal(deriveSpendingAvailability(c,50000).provisional,true);
});
test('confirmed spending excludes savings and pending bills, never subtracts paid expenses again',()=>{
 const c=deriveBalanceComposition([account],[pot]);
 assert.deepEqual(deriveSpendingAvailability(c,120000),{amountMinor:180000,shortfallMinor:0,provisional:false,commitmentsMinor:120000});
 assert.equal(deriveSpendingAvailability(c,400000).amountMinor,0);
 assert.equal(deriveSpendingAvailability(c,400000).shortfallMinor,100000);
});
test('no reported balance remains unknown; zero and negative balances remain real numbers',()=>{
 const missing=deriveBalanceComposition([{...account,balanceMinor:null}],[]);
 assert.equal(missing.reportedMinor,null);assert.equal(deriveSpendingAvailability(missing,100).amountMinor,null);
 const zero=deriveBalanceComposition([{...account,balanceMinor:0,balanceCoverage:'excludes_pots'}],[]);
 assert.equal(zero.savedMinor,0);assert.equal(zero.outsideMinor,0);assert.equal(deriveSpendingAvailability(zero,0).amountMinor,0);
 const negative=deriveBalanceComposition([{...account,balanceMinor:-500,balanceCoverage:'excludes_pots'}],[]);
 assert.equal(negative.reportedMinor,-500);assert.equal(deriveSpendingAvailability(negative,200).shortfallMinor,700);
});

test('global privacy masks currency figures embedded in financial explanations',()=>{
 assert.equal(maskMoneyInText('Saldo R$ 8.450,00, contas R$ 120,50. Vence 25/10.'),'Saldo ••••, contas ••••. Vence 25/10.');
 assert.equal(maskMoneyInText('USD 1,000.00 and € 45.20 · 3 records'),'•••• and •••• · 3 records');
});
