import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyCloseChecklist, deriveExplainableInsights, reserveSuggestion, simulateFinancialScenario } from '../.core-dist/core/financial-intelligence.js';

test('financial scenarios never mutate truth and expose the delta',()=>{
  assert.deepEqual(simulateFinancialScenario({availableMinor:500000,committedMinor:200000,amountMinor:50000,kind:'purchase'}),{
    baselineRemainderMinor:300000,projectedRemainderMinor:250000,deltaMinor:-50000,kind:'purchase'
  });
});

test('reserve suggestion is bounded by a fraction of known projected surplus',()=>{
  const result=reserveSuggestion({
    pots:[{id:'p1',name:'Viagem',balanceMinor:0,goalMinor:100000,targetDate:'2026-12-31'}],
    projectedRemainderMinor:40000,
    now:new Date('2026-09-24T12:00:00Z')
  });
  assert.ok(result);
  assert.ok(result.suggestedMinor<=10000);
});

test('critical due bill insight is explainable and source-bound',()=>{
  const insights=deriveExplainableInsights({
    transactions:[],
    commitments:[{id:'c1',description:'Energia',amountMinor:12000,dueDay:20,paidThisMonth:false}],
    now:new Date('2026-09-24T12:00:00Z')
  });
  assert.equal(insights[0].type,'due_bill');
  assert.equal(insights[0].urgency,'critical');
  assert.deepEqual(insights[0].sourceIds,['c1']);
});

test('monthly close checklist keeps exceptions explicit',()=>{
  const checks=buildMonthlyCloseChecklist({accountsCount:2,uncertainItems:1,unpaidCommitments:0,missingDocuments:0,possibleDuplicates:2});
  assert.equal(checks.find(item=>item.key==='uncertain_items').status,'attention');
  assert.equal(checks.find(item=>item.key==='open_bills').status,'done');
});
