import test from 'node:test';
import assert from 'node:assert/strict';
import { canHouseholdRole, isAssignableHouseholdRole, normalizeHouseholdRole } from '../.core-dist/core/household.js';

test('household roles enforce least privilege',()=>{
  assert.equal(canHouseholdRole('owner','owner'),true);
  assert.equal(canHouseholdRole('admin','manage_household'),true);
  assert.equal(canHouseholdRole('member','contribute'),true);
  assert.equal(canHouseholdRole('member','manage_finance'),false);
  assert.equal(canHouseholdRole('read_only','read'),true);
  assert.equal(canHouseholdRole('read_only','contribute'),false);
});

test('owner cannot be assigned through ordinary role changes',()=>{
  assert.equal(isAssignableHouseholdRole('owner'),false);
  assert.equal(isAssignableHouseholdRole('admin'),true);
  assert.equal(normalizeHouseholdRole('unexpected'),'read_only');
});
