'use client';
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/src/lib/firebase/client';

export async function ensurePrimaryHousehold(uid: string, displayName?: string | null) {
  if (!db) throw new Error('FIREBASE_NOT_CONFIGURED');
  const refs = collection(db, 'users', uid, 'householdRefs');
  const existing = await getDocs(query(refs, limit(1)));
  if (!existing.empty) return existing.docs[0].id;

  const householdRef = doc(collection(db, 'households'));
  const batch = writeBatch(db);
  batch.set(householdRef, {
    ownerUid: uid,
    name: displayName ? `Casa de ${displayName.split(' ')[0]}` : 'Minha casa',
    currency: 'BRL',
    locale: 'pt-BR',
    createdAt: serverTimestamp(),
    schemaVersion: 1
  });
  batch.set(doc(db, 'households', householdRef.id, 'members', uid), {
    role: 'owner', userId: uid, joinedAt: serverTimestamp()
  });
  batch.set(doc(db, 'users', uid, 'householdRefs', householdRef.id), {
    role: 'owner', householdId: householdRef.id, createdAt: serverTimestamp()
  });
  await batch.commit();
  return householdRef.id;
}
