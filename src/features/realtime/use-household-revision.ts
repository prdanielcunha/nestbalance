'use client';
import { useEffect, useRef } from 'react';
import { loadHouseholdRevision } from '@/src/lib/repositories/revision';

export function useHouseholdRevisionRefresh(
  householdId:string,
  onChanged:()=>void|Promise<void>,
  intervalMs=25_000
){
  const revisionRef=useRef<string|null>(null);
  const callbackRef=useRef(onChanged);
  const checkingRef=useRef(false);
  callbackRef.current=onChanged;

  useEffect(()=>{
    let disposed=false;

    const check=async(first=false)=>{
      if(disposed||checkingRef.current||document.visibilityState==='hidden') return;
      checkingRef.current=true;
      try{
        const next=await loadHouseholdRevision(householdId);
        if(disposed) return;
        if(first||revisionRef.current===null){
          revisionRef.current=next;
          return;
        }
        if(next!==revisionRef.current){
          revisionRef.current=next;
          await callbackRef.current();
          const settled=await loadHouseholdRevision(householdId).catch(()=>next);
          if(!disposed) revisionRef.current=settled;
        }
      }catch{
        // Live sync is an enhancement; ordinary focus/manual refresh remains available.
      }finally{
        checkingRef.current=false;
      }
    };

    void check(true);
    const timer=window.setInterval(()=>void check(false),intervalMs);
    const onVisible=()=>{if(document.visibilityState==='visible') void check(false);};
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{
      disposed=true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[householdId,intervalMs]);
}
