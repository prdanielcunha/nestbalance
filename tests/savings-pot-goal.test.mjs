import test from 'node:test';
import assert from 'node:assert/strict';
import {savingsPotGoalPace} from '../.core-dist/core/savings-pot-goal.js';
import {automationContributionMinor,frequencyOccurrenceDates,normalizeSavingsPotAutomation} from '../.core-dist/core/savings-pot-automation.js';

test('goal pace computes remaining value and suggested contributions',()=>{
  const pace=savingsPotGoalPace(100_000,300_000,'2026-12-21',new Date('2026-09-22T12:00:00Z'));
  assert.equal(pace.remainingMinor,200_000);
  assert.equal(pace.daysRemaining,90);
  assert.ok((pace.suggestedMonthlyMinor||0)>0);
  assert.ok((pace.suggestedWeeklyMinor||0)>0);
});

test('frequency automation generates deterministic weekly dates',()=>{
  const automation=normalizeSavingsPotAutomation({
    enabled:true,kind:'frequency',mode:'fixed',amountMinor:1000,frequency:'weekly',anchorDate:'2026-09-01'
  });
  assert.ok(automation);
  assert.deepEqual(frequencyOccurrenceDates(automation,'2026-09-22'),['2026-09-01','2026-09-08','2026-09-15','2026-09-22']);
});

test('movement automation supports percentages',()=>{
  const automation=normalizeSavingsPotAutomation({
    enabled:true,kind:'spend',mode:'percent',percentBps:500
  });
  assert.ok(automation);
  assert.equal(automationContributionMinor(automation,20_000),1_000);
});


test('round-up automation saves the cents needed for the next whole real',()=>{
  const automation=normalizeSavingsPotAutomation({enabled:true,kind:'roundup',mode:'fixed'});
  assert.ok(automation);
  assert.equal(automationContributionMinor(automation,1237),63);
  assert.equal(automationContributionMinor(automation,1200),0);
});
