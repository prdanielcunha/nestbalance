'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { VaultScreen } from '@/src/features/vault/vault-screen';

export default function VaultPage(){
  return <AuthGate>{({householdId})=><VaultScreen householdId={householdId}/>}</AuthGate>;
}
