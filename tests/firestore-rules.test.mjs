import test, { after, before, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc
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
  await env.withSecurityRulesDisabled(async context => {
    const db=context.firestore();
    await setDoc(doc(db,'households','house_a'),{ownerUid:'owner_a',name:'Casa'});
    await setDoc(doc(db,'households','house_a','members','owner_a'),{userId:'owner_a',role:'owner'});
    await setDoc(doc(db,'users','owner_a','householdRefs','house_a'),{householdId:'house_a',role:'owner'});
    await setDoc(doc(db,'households','house_a','accounts','a1'),{name:'Nubank',balanceMinor:10000});
    await setDoc(doc(db,'households','house_a','transactions','t1'),{amountMinor:1000});
    await setDoc(doc(db,'households','house_a','evidenceAssets','e1'),{status:'accepted',immutable:true});
    await setDoc(doc(db,'households','house_a','evidenceAssets','e1','analysisLocks','vision-v1'),{requestId:'server'});
  });
});

after(async () => {
  await env?.cleanup();
});

test('authenticated browser cannot bootstrap a household directly', async () => {
  const db=env.authenticatedContext('new_user').firestore();
  await assertFails(setDoc(doc(db,'households','house_new'),{ownerUid:'new_user',name:'Casa'}));
  await assertFails(setDoc(doc(db,'users','new_user','householdRefs','house_new'),{householdId:'house_new',role:'owner'}));
});

test('member cannot read household metadata directly', async () => {
  const db=env.authenticatedContext('owner_a').firestore();
  await assertFails(getDoc(doc(db,'households','house_a')));
  await assertFails(getDoc(doc(db,'households','house_a','members','owner_a')));
});

test('member cannot read or write accounts directly', async () => {
  const db=env.authenticatedContext('owner_a').firestore();
  await assertFails(getDoc(doc(db,'households','house_a','accounts','a1')));
  await assertFails(setDoc(doc(db,'households','house_a','accounts','a2'),{name:'Conta',balanceMinor:1}));
});

test('member cannot read or write transactions directly', async () => {
  const db=env.authenticatedContext('owner_a').firestore();
  await assertFails(getDoc(doc(db,'households','house_a','transactions','t1')));
  await assertFails(setDoc(doc(db,'households','house_a','transactions','t2'),{amountMinor:100}));
});

test('member cannot read evidence metadata or AI locks directly', async () => {
  const db=env.authenticatedContext('owner_a').firestore();
  await assertFails(getDoc(doc(db,'households','house_a','evidenceAssets','e1')));
  await assertFails(getDoc(doc(db,'households','house_a','evidenceAssets','e1','analysisLocks','vision-v1')));
});

test('member cannot read or write server-only indexes', async () => {
  const db=env.authenticatedContext('owner_a').firestore();
  for(const collectionName of ['accountKeys','captureFingerprints','evidenceHashes']){
    const target=doc(db,'households','house_a',collectionName,'k1');
    await assertFails(getDoc(target));
    await assertFails(setDoc(target,{value:'client'}));
  }
});

test('even owner cannot delete financial data directly', async () => {
  const db=env.authenticatedContext('owner_a').firestore();
  await assertFails(deleteDoc(doc(db,'households','house_a','transactions','t1')));
  await assertFails(deleteDoc(doc(db,'households','house_a','accounts','a1')));
  await assertFails(deleteDoc(doc(db,'households','house_a')));
});
