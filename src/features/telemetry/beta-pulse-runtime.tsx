'use client';

import { useEffect } from 'react';
import { loadBetaStatus, pulseFamilyBeta } from '@/src/lib/repositories/support';
import { bootstrapSession } from '@/src/lib/repositories/session';
import { nestBalanceE2eAuthMode } from '@/src/lib/browser-auth-token';

export function BetaPulseRuntime(){
  useEffect(()=>{
    if(nestBalanceE2eAuthMode()) return;
    let disposed=false;
    const timer=window.setTimeout(async()=>{
      try{
        const session=await bootstrapSession();
        if(disposed||!session.householdId) return;
        const status=await loadBetaStatus(session.householdId);
        if(disposed||!status.enrolled) return;
        const week=new Date().toISOString().slice(0,10);
        const key='nestbalance-beta-pulse-'+week;
        if(localStorage.getItem(key)==='1') return;
        const result=await pulseFamilyBeta(session.householdId);
        if(result.recorded) localStorage.setItem(key,'1');
      }catch{
        // Beta measurement is optional and must never interfere with the product.
      }
    },3500);
    return ()=>{disposed=true;window.clearTimeout(timer);};
  },[]);
  return null;
}
