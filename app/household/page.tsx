'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { HouseholdSettings } from '@/src/features/household/household-settings';

export default function HouseholdPage(){
  return <AuthGate>{state=><HouseholdSettings
    householdId={state.householdId}
    sessionHouseholds={state.households}
    user={state.user}
  />}</AuthGate>;
}
