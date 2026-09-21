'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { AssistantScreen } from '@/src/features/assistant/assistant-screen';

export default function AssistantPage(){
  return <AuthGate>{({householdId,households})=>{
    const role=households.find(item=>item.id===householdId)?.role||'read_only';
    return <AssistantScreen householdId={householdId} role={role}/>;
  }}</AuthGate>;
}
