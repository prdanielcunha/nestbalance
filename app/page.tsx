'use client';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { HomeScreen } from '@/src/features/home/home-screen';
export default function Page(){ return <AuthGate>{({user, householdId}) => <HomeScreen uid={user.uid} householdId={householdId} />}</AuthGate>; }
