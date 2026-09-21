import type { Request } from 'express';
import { adminAuth, adminDb } from './firebase-admin.js';
import {
  canHouseholdRole,
  normalizeHouseholdRole,
  type HouseholdCapability,
  type HouseholdRole
} from '../src/core/household.js';

const checkRevokedTokens = process.env.FIREBASE_CHECK_REVOKED_TOKENS === 'true';

export async function requireFirebaseUser(req: Request) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('AUTH_REQUIRED'), { statusCode: 401 });
  try {
    // Signature, audience, issuer and expiration are always verified.
    // Revocation lookup is opt-in because it requires privileged Firebase Auth
    // user-read IAM that the dedicated NestBalance runtime does not assume.
    return await adminAuth.verifyIdToken(match[1], checkRevokedTokens);
  } catch (err: any) {
    console.warn('NestBalance token verification rejected', {
      code: typeof err?.code === 'string' ? err.code : 'unknown',
      revocationCheck: checkRevokedTokens
    });
    throw Object.assign(new Error('INVALID_SESSION'), { statusCode: 401 });
  }
}

export async function requireHouseholdMember(
  householdId: string,
  uid: string,
  capability: HouseholdCapability = 'read'
) {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(householdId)) {
    throw Object.assign(new Error('INVALID_HOUSEHOLD'), { statusCode: 400 });
  }
  const member = await adminDb.doc(`households/${householdId}/members/${uid}`).get();
  if (!member.exists) throw Object.assign(new Error('HOUSEHOLD_ACCESS_DENIED'), { statusCode: 403 });
  const data = member.data() || {};
  const role: HouseholdRole = normalizeHouseholdRole(data.role);
  if (!canHouseholdRole(role, capability)) {
    throw Object.assign(new Error('HOUSEHOLD_ACCESS_DENIED'), { statusCode: 403 });
  }
  return { ...data, role } as typeof data & { role: HouseholdRole };
}
