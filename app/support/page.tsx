'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { SupportScreen } from '@/src/features/support/support-screen';

export default function SupportPage(){
  return <AuthGate>{state=>{
    const role=state.households.find(item=>item.id===state.householdId)?.role||'read_only';
    return <SupportScreen householdId={state.householdId} role={role}/>;
  }}</AuthGate>;
}
