import type { Request } from 'express';
import { adminAuth, adminDb } from './firebase-admin.js';

export async function requireFirebaseUser(req: Request) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('AUTH_REQUIRED'), { statusCode: 401 });
  try {
    return await adminAuth.verifyIdToken(match[1], true);
  } catch {
    throw Object.assign(new Error('INVALID_SESSION'), { statusCode: 401 });
  }
}

export async function requireHouseholdMember(householdId: string, uid: string) {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(householdId)) {
    throw Object.assign(new Error('INVALID_HOUSEHOLD'), { statusCode: 400 });
  }
  const member = await adminDb.doc(`households/${householdId}/members/${uid}`).get();
  if (!member.exists) throw Object.assign(new Error('HOUSEHOLD_ACCESS_DENIED'), { statusCode: 403 });
  return member.data() as { role?: string };
}
