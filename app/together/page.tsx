'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { TogetherScreen } from '@/src/features/collaboration/together-screen';

export default function TogetherPage(){
  return <AuthGate>{state=>{
    const role=state.households.find(item=>item.id===state.householdId)?.role||'read_only';
    return <TogetherScreen householdId={state.householdId} role={role} uid={state.user.uid}/>;
  }}</AuthGate>;
}
