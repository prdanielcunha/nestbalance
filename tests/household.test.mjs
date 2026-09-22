import test from 'node:test';
import assert from 'node:assert/strict';
import { canHouseholdRole, isAssignableHouseholdRole, normalizeHouseholdRole } from '../.core-dist/core/household.js';

test('shared access roles enforce the intended permission ladder',()=>{
  assert.equal(canHouseholdRole('owner','owner'),true);

  // Partner/full access: everything shared except owner-only destructive actions.
  assert.equal(canHouseholdRole('admin','manage_household'),true);
  assert.equal(canHouseholdRole('admin','manage_finance'),true);
  assert.equal(canHouseholdRole('admin','manage_connections'),true);
  assert.equal(canHouseholdRole('admin','owner'),false);

  // Financial manager: money and bank connections, but not people/settings.
  assert.equal(canHouseholdRole('manager','manage_finance'),true);
  assert.equal(canHouseholdRole('manager','manage_connections'),true);
  assert.equal(canHouseholdRole('manager','manage_household'),false);

  // Contributor: everyday shared records without structural administration.
  assert.equal(canHouseholdRole('member','contribute'),true);
  assert.equal(canHouseholdRole('member','manage_finance'),false);

  // Viewer: strictly read-only.
  assert.equal(canHouseholdRole('read_only','read'),true);
  assert.equal(canHouseholdRole('read_only','contribute'),false);
});

test('owner remains protected while all four shareable access levels are assignable',()=>{
  assert.equal(isAssignableHouseholdRole('owner'),false);
  assert.equal(isAssignableHouseholdRole('admin'),true);
  assert.equal(isAssignableHouseholdRole('manager'),true);
  assert.equal(isAssignableHouseholdRole('member'),true);
  assert.equal(isAssignableHouseholdRole('read_only'),true);
  assert.equal(normalizeHouseholdRole('manager'),'manager');
  assert.equal(normalizeHouseholdRole('unexpected'),'read_only');
});
