'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { AccountsScreen } from '@/src/features/accounts/accounts-screen';

export default function AccountsPage(){
  return <AuthGate>{({householdId})=><AccountsScreen householdId={householdId}/>}</AuthGate>;
}
