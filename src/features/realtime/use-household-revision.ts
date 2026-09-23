'use client';
import { useEffect, useRef } from 'react';
import { auth } from '@/src/lib/firebase/client';

const DEFAULT_INTERVAL_MS=25_000;

async function readRevision(householdId:string,signal:AbortSignal){
  const token=await auth?.currentUser?.getIdToken();
  if(!token) return null;
  const response=await fetch('/api/household/revision',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify({householdId}),
    cache:'no-store',
    signal
  });
  if(!response.ok) return null;
  const json=await response.json().catch(()=>null) as {revision?:unknown}|null;
  return typeof json?.revision==='string'?json.revision:null;
}

/**
 * Polls only a tiny household revision while the app is visible.
 * Full financial data reloads only when another audited change is observed.
 */
export function useHouseholdRevision(
  householdId:string,
  onChange:()=>void|Promise<void>,
  intervalMs=DEFAULT_INTERVAL_MS
){
  const onChangeRef=useRef(onChange);
  onChangeRef.current=onChange;

  useEffect(()=>{
    let active=true;
    let lastRevision:string|null=null;
    let checking=false;
    let controller:AbortController|null=null;

    const check=async()=>{
      if(!active||checking||document.visibilityState!=='visible') return;
      checking=true;
      controller?.abort();
      controller=new AbortController();
      try{
        const next=await readRevision(householdId,controller.signal);
        if(!active||!next) return;
        if(lastRevision===null){
          lastRevision=next;
          return;
        }
        if(next!==lastRevision){
          lastRevision=next;
          await onChangeRef.current();
        }
      }catch{
        // Realtime enhancement must never block finance usage.
      }finally{
        checking=false;
      }
    };

    void check();
    const timer=window.setInterval(()=>void check(),Math.max(15_000,intervalMs));
    const onVisibility=()=>{if(document.visibilityState==='visible') void check();};
    document.addEventListener('visibilitychange',onVisibility);

    return ()=>{
      active=false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisibility);
    };
  },[householdId,intervalMs]);
}
