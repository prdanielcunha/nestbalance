'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { MovementsScreen } from '@/src/features/movements/movements-screen';

export default function MovementsPage(){
  return <AuthGate>{({householdId})=><MovementsScreen householdId={householdId}/>}</AuthGate>;
}
