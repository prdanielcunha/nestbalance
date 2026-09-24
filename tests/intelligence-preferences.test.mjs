import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsInsightPreference, DEFAULT_INTELLIGENCE_PREFERENCES, normalizeIntelligencePreferences } from '../.core-dist/core/intelligence-preferences.js';

test('intelligence preferences normalize partial input',()=>{
  const prefs=normalizeIntelligencePreferences({duplicates:false,minimumUrgency:'high',channels:{device:true}});
  assert.equal(prefs.duplicates,false);
  assert.equal(prefs.minimumUrgency,'high');
  assert.equal(prefs.channels.device,true);
  assert.equal(prefs.channels.inApp,true);
});

test('preference filter respects subject and minimum urgency',()=>{
  const prefs={...DEFAULT_INTELLIGENCE_PREFERENCES,minimumUrgency:'high',subscriptions:false};
  assert.equal(acceptsInsightPreference(prefs,{type:'due_bill',urgency:'critical'}),true);
  assert.equal(acceptsInsightPreference(prefs,{type:'spending_change',urgency:'normal'}),false);
  assert.equal(acceptsInsightPreference({...prefs,minimumUrgency:'low'},{type:'subscription',urgency:'low'}),false);
});
