'use client';

export type SyncStatus='synced'|'updating'|'offline'|'failed'|'remote-change'|'pending'|'conflict';

const EVENT_NAME='nestbalance:sync-status';

export function publishSyncStatus(status:SyncStatus){
  if(typeof window==='undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME,{detail:status}));
}

export function subscribeSyncStatus(listener:(status:SyncStatus)=>void){
  if(typeof window==='undefined') return ()=>undefined;
  const handler=(event:Event)=>{
    const status=(event as CustomEvent<SyncStatus>).detail;
    if(status) listener(status);
  };
  window.addEventListener(EVENT_NAME,handler);
  return ()=>window.removeEventListener(EVENT_NAME,handler);
}
