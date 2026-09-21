'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { PrivacyCenter } from '@/src/features/privacy/privacy-center';

export default function PrivacyPage(){
  return <AuthGate>{state=>{
    const current=state.households.find(item=>item.id===state.householdId);
    return <PrivacyCenter householdId={state.householdId} user={state.user} householdName={current?.name||'Meu Lar'} role={current?.role||'read_only'}/>;
  }}</AuthGate>;
}
