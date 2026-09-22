import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROACTIVITY_PREFERENCES,
  normalizeProactivityPreferences,
  parseProactivityPreferences
} from '../.core-dist/core/proactivity.js';

test('proactivity defaults keep high-signal Home attention enabled and low-priority endings quiet',()=>{
  assert.deepEqual(DEFAULT_PROACTIVITY_PREFERENCES,{
    dueBills:true,
    anomalies:true,
    spendingChanges:true,
    installmentEnds:false
  });
});

test('proactivity preferences are normalized without trusting malformed values',()=>{
  assert.deepEqual(normalizeProactivityPreferences({dueBills:false,installmentEnds:true}),{
    dueBills:false,
    anomalies:true,
    spendingChanges:true,
    installmentEnds:true
  });
  assert.equal(parseProactivityPreferences({dueBills:true,anomalies:true}),null);
  assert.deepEqual(parseProactivityPreferences({
    dueBills:false,
    anomalies:true,
    spendingChanges:false,
    installmentEnds:true
  }),{
    dueBills:false,
    anomalies:true,
    spendingChanges:false,
    installmentEnds:true
  });
});
