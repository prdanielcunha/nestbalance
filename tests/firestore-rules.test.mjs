import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  writeBatch
} from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nestbalance-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  await env?.cleanup();
});

async function seedHousehold(hid, ownerUid, extraMembers = {}) {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'households', hid), { ownerUid, name: 'Casa', currency: 'BRL' });
    await setDoc(doc(db, 'households', hid, 'members', ownerUid), { userId: ownerUid, role: 'owner' });
    for (const [uid, role] of Object.entries(extraMembers)) {
      await setDoc(doc(db, 'households', hid, 'members', uid), { userId: uid, role });
    }
  });
}

test('owner bootstraps household + member + reference atomically', async () => {
  const db = env.authenticatedContext('u_owner').firestore();
  const hid = 'house_bootstrap';
  const batch = writeBatch(db);
  batch.set(doc(db, 'households', hid), { ownerUid: 'u_owner', name: 'Minha casa', currency: 'BRL' });
  batch.set(doc(db, 'households', hid, 'members', 'u_owner'), { userId: 'u_owner', role: 'owner' });
  batch.set(doc(db, 'users', 'u_owner', 'householdRefs', hid), { householdId: hid, role: 'owner' });
  await assertSucceeds(batch.commit());
});

test('outsider cannot read another household', async () => {
  await seedHousehold('house_private', 'owner_a');
  const outsiderDb = env.authenticatedContext('outsider').firestore();
  await assertFails(getDoc(doc(outsiderDb, 'households', 'house_private')));
});

test('admin cannot promote a member to owner', async () => {
  await seedHousehold('house_roles', 'owner_a', { admin_a: 'admin', member_a: 'member' });
  const db = env.authenticatedContext('admin_a').firestore();
  await assertFails(setDoc(doc(db, 'households', 'house_roles', 'members', 'member_a'), {
    userId: 'member_a', role: 'owner'
  }));
});

test('admin may create a regular member but not a second owner', async () => {
  await seedHousehold('house_invite', 'owner_a', { admin_a: 'admin' });
  const db = env.authenticatedContext('admin_a').firestore();
  await assertSucceeds(setDoc(doc(db, 'households', 'house_invite', 'members', 'member_b'), {
    userId: 'member_b', role: 'member'
  }));
  await assertFails(setDoc(doc(db, 'households', 'house_invite', 'members', 'owner_b'), {
    userId: 'owner_b', role: 'owner'
  }));
});

test('client cannot create financial transaction directly', async () => {
  await seedHousehold('house_server', 'owner_a');
  const db = env.authenticatedContext('owner_a').firestore();
  await assertFails(setDoc(doc(db, 'households', 'house_server', 'transactions', 't1'), {
    createdBy: 'owner_a', amountMinor: 1000, currency: 'BRL'
  }));
});

test('client cannot create evidence metadata directly', async () => {
  await seedHousehold('house_evidence', 'owner_a');
  const db = env.authenticatedContext('owner_a').firestore();
  await assertFails(setDoc(doc(db, 'households', 'house_evidence', 'evidenceAssets', 'e1'), {
    uploadedBy: 'owner_a', immutable: true
  }));
});

test('owner identity, not mutable role, controls household deletion', async () => {
  await seedHousehold('house_delete', 'owner_a', { admin_a: 'admin' });
  const adminDb = env.authenticatedContext('admin_a').firestore();
  const ownerDb = env.authenticatedContext('owner_a').firestore();
  const target = doc(adminDb, 'households', 'house_delete');
  await assertFails((await import('firebase/firestore')).deleteDoc(target));
  const ownerTarget = doc(ownerDb, 'households', 'house_delete');
  await assertSucceeds((await import('firebase/firestore')).deleteDoc(ownerTarget));
  let existsAfterDelete = true;
  await env.withSecurityRulesDisabled(async context => {
    existsAfterDelete = (await getDoc(doc(context.firestore(), 'households', 'house_delete'))).exists();
  });
  assert.equal(existsAfterDelete, false);
});

test('member cannot read evidence metadata directly from Firestore', async () => {
  await seedHousehold('house_vault', 'owner_a');
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'households', 'house_vault', 'evidenceAssets', 'e1'), {
      status: 'accepted', immutable: true, originalName: 'private.pdf'
    });
  });
  const db = env.authenticatedContext('owner_a').firestore();
  await assertFails(getDoc(doc(db, 'households', 'house_vault', 'evidenceAssets', 'e1')));
});

test('client cannot create account directly', async () => {
  await seedHousehold('house_accounts', 'owner_a');
  const db = env.authenticatedContext('owner_a').firestore();
  await assertFails(setDoc(doc(db, 'households', 'house_accounts', 'accounts', 'a1'), {
    name: 'Nubank', type: 'bank', balanceMinor: 10000, currency: 'BRL'
  }));
});

test('client cannot read or write account dedup keys', async () => {
  await seedHousehold('house_account_keys', 'owner_a');
  const db = env.authenticatedContext('owner_a').firestore();
  await assertFails(getDoc(doc(db, 'households', 'house_account_keys', 'accountKeys', 'k1')));
  await assertFails(setDoc(doc(db, 'households', 'house_account_keys', 'accountKeys', 'k1'), { accountId: 'a1' }));
});

test('client cannot read or write AI analysis locks', async () => {
  await seedHousehold('house_ai_locks', 'owner_a');
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'households', 'house_ai_locks', 'evidenceAssets', 'e1'), {
      status: 'accepted', immutable: true
    });
    await setDoc(doc(context.firestore(), 'households', 'house_ai_locks', 'evidenceAssets', 'e1', 'analysisLocks', 'vision-v1'), {
      requestId: 'server-only', expiresAtMs: Date.now()+10000
    });
  });
  const db = env.authenticatedContext('owner_a').firestore();
  const lock = doc(db, 'households', 'house_ai_locks', 'evidenceAssets', 'e1', 'analysisLocks', 'vision-v1');
  await assertFails(getDoc(lock));
  await assertFails(setDoc(lock, { requestId: 'client' }));
});
