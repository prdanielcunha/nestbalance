import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOME_PREFERENCES, normalizeHomePreferences } from '../.core-dist/core/home-preferences.js';

test('home preferences normalize unknown values safely',()=>{
  assert.deepEqual(normalizeHomePreferences(null),DEFAULT_HOME_PREFERENCES);
  assert.deepEqual(normalizeHomePreferences({mode:'couple',incomeFrequency:'variable'}),{mode:'couple',incomeFrequency:'variable'});
  assert.deepEqual(normalizeHomePreferences({mode:'invalid',incomeFrequency:'daily'}),DEFAULT_HOME_PREFERENCES);
});
