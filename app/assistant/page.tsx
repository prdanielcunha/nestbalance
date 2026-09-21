'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { AssistantScreen } from '@/src/features/assistant/assistant-screen';

export default function AssistantPage(){
  return <AuthGate>{({householdId})=><AssistantScreen householdId={householdId}/>}</AuthGate>;
}
