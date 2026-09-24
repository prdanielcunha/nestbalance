import test from 'node:test';
import assert from 'node:assert/strict';
import { syncDomainIntersects, syncDomainsForAuditType } from '../.core-dist/realtime.js';

test('realtime domains never expose event content and route finance changes selectively',()=>{
  assert.deepEqual(syncDomainsForAuditType('commitment.paid'),['home','activity','movements','assistant']);
  assert.deepEqual(syncDomainsForAuditType('account.balance_updated'),['home','activity','accounts','assistant']);
  assert.deepEqual(syncDomainsForAuditType('invoice.confirmed'),['home','activity','accounts','invoices','assistant']);
  assert.deepEqual(syncDomainsForAuditType('savings_pot.updated'),['home','activity','pots','assistant']);
  assert.deepEqual(syncDomainsForAuditType('evidence.finalized'),['home','activity','documents']);
  assert.deepEqual(syncDomainsForAuditType('household.member_removed'),['home','activity','household']);
});

test('domain subscriptions ignore unrelated invalidations',()=>{
  assert.equal(syncDomainIntersects(['pots'],['movements']),false);
  assert.equal(syncDomainIntersects(['movements'],['movements']),true);
  assert.equal(syncDomainIntersects(['activity'],[]),true);
});
