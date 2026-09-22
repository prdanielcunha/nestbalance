import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeHouseholdActivity } from '../.core-dist/core/activity.js';

test('atividade compartilhada é visível aos membros do Lar',()=>{
  assert.equal(canSeeHouseholdActivity({scope:'household',actorUid:'u1'},'u2'),true);
  assert.equal(canSeeHouseholdActivity({actorUid:'u1'},'u2'),true);
});

test('atividade pessoal só aparece para o próprio autor',()=>{
  assert.equal(canSeeHouseholdActivity({scope:'personal',actorUid:'u1'},'u1'),true);
  assert.equal(canSeeHouseholdActivity({scope:'personal',actorUid:'u1'},'u2'),false);
  assert.equal(canSeeHouseholdActivity({scope:'personal'},'u1'),false);
});
