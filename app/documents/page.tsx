'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { VaultScreen } from '@/src/features/vault/vault-screen';

export default function DocumentsPage(){
  return <AuthGate>{({householdId,households})=>{
    const role=households.find(item=>item.id===householdId)?.role||'read_only';
    return <VaultScreen householdId={householdId} role={role}/>;
  }}</AuthGate>;
}
