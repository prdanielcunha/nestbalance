'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { HomeScreen } from '@/src/features/home/home-screen';

export default function Page(){
  return <AuthGate>{({householdId,households,firstValueStartedAtMs})=>{
    const role=households.find(item=>item.id===householdId)?.role||'read_only';
    return <HomeScreen householdId={householdId} role={role} firstValueStartedAtMs={firstValueStartedAtMs}/>;
  }}</AuthGate>;
}
