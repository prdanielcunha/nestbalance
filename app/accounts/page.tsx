'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { AccountsScreen } from '@/src/features/accounts/accounts-screen';

export default function AccountsPage(){
  return <AuthGate>{({householdId,households})=>{
    const role=households.find(item=>item.id===householdId)?.role||'read_only';
    return <AccountsScreen householdId={householdId} role={role}/>;
  }}</AuthGate>;
}
