'use client';
import { useEffect, useRef } from 'react';
import { syncDomainIntersects, type SyncDomain } from '@/src/core/realtime';
import { loadHouseholdRevision, streamHouseholdRevisions } from '@/src/lib/repositories/revision';
import { publishSyncStatus } from '@/src/features/realtime/sync-status-store';

const BASE_POLL_MS=25_000;
const MAX_POLL_MS=120_000;

export function useHouseholdRevisionRefresh(
  householdId:string,
  onChanged:()=>void|Promise<void>,
  intervalMs=BASE_POLL_MS,
  domains:readonly SyncDomain[]=[]
){
  const revisionRef=useRef<string|null>(null);
  const callbackRef=useRef(onChanged);
  const checkingRef=useRef(false);
  callbackRef.current=onChanged;

  useEffect(()=>{
    let disposed=false;
    let pollTimer:number|undefined;
    let streamAbort:AbortController|null=null;
    let pollDelay=Math.max(BASE_POLL_MS,intervalMs);
    const e2e=process.env.NEXT_PUBLIC_NESTBALANCE_E2E==='true';

    const clearPoll=()=>{
      if(pollTimer!==undefined) window.clearTimeout(pollTimer);
      pollTimer=undefined;
    };

    const schedulePoll=(delay=pollDelay)=>{
      clearPoll();
      if(disposed||document.visibilityState==='hidden') return;
      pollTimer=window.setTimeout(()=>void check(false),delay);
    };

    const refreshFromRemote=async()=>{
      if(disposed) return;
      publishSyncStatus('remote-change');
      try{
        publishSyncStatus('updating');
        await callbackRef.current();
        if(!disposed) publishSyncStatus('synced');
      }catch{
        if(!disposed) publishSyncStatus(navigator.onLine?'failed':'offline');
      }
    };

    const check=async(first=false)=>{
      if(disposed||checkingRef.current||document.visibilityState==='hidden') return;
      if(!navigator.onLine){
        publishSyncStatus('offline');
        schedulePoll(Math.min(MAX_POLL_MS,pollDelay*2));
        return;
      }
      checkingRef.current=true;
      try{
        const next=await loadHouseholdRevision(householdId);
        if(disposed) return;
        if(first||revisionRef.current===null){
          revisionRef.current=next;
          pollDelay=Math.max(BASE_POLL_MS,intervalMs);
          publishSyncStatus('synced');
        }else if(next!==revisionRef.current){
          revisionRef.current=next;
          await refreshFromRemote();
          const settled=await loadHouseholdRevision(householdId).catch(()=>next);
          if(!disposed) revisionRef.current=settled;
          pollDelay=Math.max(BASE_POLL_MS,intervalMs);
        }else{
          publishSyncStatus('synced');
          pollDelay=Math.min(MAX_POLL_MS,Math.max(BASE_POLL_MS,pollDelay*1.5));
        }
      }catch{
        if(!disposed){
          publishSyncStatus(navigator.onLine?'failed':'offline');
          pollDelay=Math.min(MAX_POLL_MS,Math.max(BASE_POLL_MS,pollDelay*2));
        }
      }finally{
        checkingRef.current=false;
        schedulePoll();
      }
    };

    const startStream=async()=>{
      if(disposed||e2e||document.visibilityState==='hidden'||!navigator.onLine) return;
      streamAbort?.abort();
      const controller=new AbortController();
      streamAbort=controller;
      try{
        await streamHouseholdRevisions(householdId,controller.signal,event=>{
          if(disposed||controller.signal.aborted) return;
          const isInitial=revisionRef.current===null;
          const changed=revisionRef.current!==event.revision;
          revisionRef.current=event.revision;
          if(isInitial){
            publishSyncStatus('synced');
            return;
          }
          if(changed&&syncDomainIntersects(event.domains,domains)){
            void refreshFromRemote();
          }
        });
        if(!disposed&&!controller.signal.aborted){
          schedulePoll(BASE_POLL_MS);
          window.setTimeout(()=>void startStream(),1_500);
        }
      }catch(error){
        if(disposed||controller.signal.aborted) return;
        publishSyncStatus(navigator.onLine?'failed':'offline');
        schedulePoll(BASE_POLL_MS);
        window.setTimeout(()=>void startStream(),Math.min(MAX_POLL_MS,pollDelay));
      }
    };

    const onVisible=()=>{
      if(document.visibilityState==='visible'){
        void check(false);
        void startStream();
      }else{
        streamAbort?.abort();
        clearPoll();
      }
    };
    const onOnline=()=>{
      pollDelay=Math.max(BASE_POLL_MS,intervalMs);
      publishSyncStatus('updating');
      void check(false);
      void startStream();
    };
    const onOffline=()=>{
      streamAbort?.abort();
      publishSyncStatus('offline');
      schedulePoll(MAX_POLL_MS);
    };

    void check(true);
    void startStream();
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('online',onOnline);
    window.addEventListener('offline',onOffline);

    return ()=>{
      disposed=true;
      clearPoll();
      streamAbort?.abort();
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('online',onOnline);
      window.removeEventListener('offline',onOffline);
    };
  },[householdId,intervalMs,domains.join('|')]);
}
