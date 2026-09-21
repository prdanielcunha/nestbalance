import test from 'node:test';
import assert from 'node:assert/strict';
import { commitmentPaymentPeriod, matchPayableCommitments } from '../.core-dist/core/commitment-payments.js';

test('valor e nome iguais produzem candidato forte',()=>{
  const matches=matchPayableCommitments(
    {amountMinor:11990,description:'Pagamento internet Vivo',observedOn:'2026-09-10'},
    [{id:'internet',description:'Internet Vivo',amountMinor:11990,status:'pending',recurring:true,recurrence:'monthly',dueDay:10}]
  );
  assert.equal(matches[0].commitment.id,'internet');
  assert.ok(matches[0].score>=100);
});

test('mesmo valor em duas contas mantém ambas para confirmação humana',()=>{
  const matches=matchPayableCommitments(
    {amountMinor:10000,description:'Pix pagamento',observedOn:'2026-09-10'},
    [
      {id:'a',description:'Internet',amountMinor:10000,status:'pending',dueDay:10},
      {id:'b',description:'Academia',amountMinor:10000,status:'pending',dueDay:10}
    ]
  );
  assert.equal(matches.length,2);
  assert.equal(matches[0].score,matches[1].score);
});

test('valor incompatível não sugere conta só pelo nome',()=>{
  const matches=matchPayableCommitments(
    {amountMinor:500000,description:'Internet Vivo',observedOn:'2026-09-10'},
    [{id:'internet',description:'Internet Vivo',amountMinor:11990,status:'pending',dueDay:10}]
  );
  assert.equal(matches.length,0);
});

test('conta recorrente paga usa período mensal e avulsa usa once',()=>{
  assert.equal(commitmentPaymentPeriod({id:'a',description:'Internet',amountMinor:100,recurring:true,recurrence:'monthly'},'2026-09-21'),'2026-09');
  assert.equal(commitmentPaymentPeriod({id:'b',description:'Dentista',amountMinor:100,recurring:false},'2026-09-21'),'once');
});
