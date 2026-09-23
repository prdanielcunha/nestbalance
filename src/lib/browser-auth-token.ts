'use client';
import { auth } from '@/src/lib/firebase/client';

export function nestBalanceE2eAuthMode(){
  return process.env.NEXT_PUBLIC_NESTBALANCE_E2E==='true'
    && typeof window!=='undefined'
    && new URLSearchParams(window.location.search).get('e2eAuth')==='1';
}

export async function getBrowserAuthToken(){
  if(nestBalanceE2eAuthMode()) return 'nestbalance-e2e-token';
  const token=await auth?.currentUser?.getIdToken();
  if(!token) throw new Error('AUTH_REQUIRED');
  return token;
}
