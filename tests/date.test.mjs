import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidIsoDate, normalizeIsoDate } from '../.core-dist/core/date.js';

test('aceita datas ISO reais inclusive ano bissexto',()=>{
  assert.equal(normalizeIsoDate('2028-02-29'),'2028-02-29');
  assert.equal(isValidIsoDate('2026-12-31'),true);
});

test('rejeita datas ISO impossíveis em vez de normalizar silenciosamente',()=>{
  assert.equal(normalizeIsoDate('2026-02-29'),null);
  assert.equal(normalizeIsoDate('2026-02-31'),null);
  assert.equal(normalizeIsoDate('2026-13-01'),null);
  assert.equal(normalizeIsoDate('31/12/2026'),null);
});
