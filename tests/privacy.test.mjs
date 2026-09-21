import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessScopedRecord, normalizeFinancialScope, scopedDedupNamespace, scopedOwnerUid } from '../.core-dist/core/privacy.js';

test('legacy records remain household-visible',()=>{
  assert.equal(normalizeFinancialScope(undefined),'household');
  assert.equal(canAccessScopedRecord({},'u1'),true);
});

test('personal records are visible only to their owner',()=>{
  assert.equal(canAccessScopedRecord({scope:'personal',ownerUid:'u1'},'u1'),true);
  assert.equal(canAccessScopedRecord({scope:'personal',ownerUid:'u1'},'u2'),false);
  assert.equal(canAccessScopedRecord({scope:'personal'},'u1'),false);
});

test('personal dedup namespace is user-isolated',()=>{
  assert.equal(scopedDedupNamespace('household','u1'),'household');
  assert.notEqual(scopedDedupNamespace('personal','u1'),scopedDedupNamespace('personal','u2'));
  assert.equal(scopedOwnerUid('personal','u1'),'u1');
  assert.equal(scopedOwnerUid('household','u1'),null);
});
