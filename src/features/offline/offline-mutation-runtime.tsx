'use client';

import { useEffect } from 'react';
import { flushOfflineCaptureMutations, pendingOfflineMutationCount } from '@/src/lib/offline-mutation-queue';
import { publishSyncStatus } from '@/src/features/realtime/sync-status-store';

export function OfflineMutationRuntime(){
  useEffect(()=>{
    let disposed=false;
    let working=false;

    const sync=async()=>{
      if(disposed||working) return;
      if(!navigator.onLine){
        const pending=await pendingOfflineMutationCount().catch(()=>0);
        publishSyncStatus(pending>0?'pending':'offline');
        return;
      }
      working=true;
      try{
        const before=await pendingOfflineMutationCount();
        if(before>0) publishSyncStatus('updating');
        const result=await flushOfflineCaptureMutations();
        if(disposed) return;
        publishSyncStatus(result.remaining>0?'pending':'synced');
      }catch{
        if(!disposed) publishSyncStatus(navigator.onLine?'failed':'offline');
      }finally{
        working=false;
      }
    };

    void sync();
    const onOnline=()=>void sync();
    const onOffline=()=>void sync();
    const onVisible=()=>{if(document.visibilityState==='visible') void sync();};
    window.addEventListener('online',onOnline);
    window.addEventListener('offline',onOffline);
    document.addEventListener('visibilitychange',onVisible);

    return ()=>{
      disposed=true;
      window.removeEventListener('online',onOnline);
      window.removeEventListener('offline',onOffline);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[]);

  return null;
}
