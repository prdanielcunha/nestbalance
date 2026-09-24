'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { FinancialInboxScreen } from '@/src/features/inbox/financial-inbox-screen';

export default function InboxPage(){
  return <AuthGate>{state=>{
    const role=state.households.find(item=>item.id===state.householdId)?.role||'read_only';
    return <FinancialInboxScreen householdId={state.householdId} role={role}/>;
  }}</AuthGate>;
}
