'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { MovementsScreen } from '@/src/features/movements/movements-screen';

export default function MovementsPage(){
  return <AuthGate>{({householdId,households})=>{
    const role=households.find(item=>item.id===householdId)?.role||'read_only';
    return <MovementsScreen householdId={householdId} role={role}/>;
  }}</AuthGate>;
}
