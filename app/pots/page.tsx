'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { PotsScreen } from '@/src/features/pots/pots-screen';

export default function PotsPage(){
  return <AuthGate>{({householdId,households})=>{
    const role=households.find(item=>item.id===householdId)?.role||'read_only';
    return <PotsScreen householdId={householdId} role={role}/>;
  }}</AuthGate>;
}
