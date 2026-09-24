'use client';

import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';
import type { FinancialScope } from '@/src/core/privacy';

const DB_NAME='nestbalance-offline-v1';
const STORE='mutations';
const MAX_AGE_MS=7*24*60*60*1000;

export type OfflineCaptureMutation={
  id:string;
  kind:'capture_commit';
  householdId:string;
  sourceText:string;
  observedOn:string;
  scope:FinancialScope;
  createdAt:number;
  attempts:number;
};

function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store=db.createObjectStore(STORE,{keyPath:'id'});
        store.createIndex('createdAt','createdAt');
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('OFFLINE_DB_OPEN_FAILED'));
  });
}

async function withStore<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb();
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      const request=run(tx.objectStore(STORE));
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('OFFLINE_DB_REQUEST_FAILED'));
      tx.onabort=()=>reject(tx.error||new Error('OFFLINE_DB_TRANSACTION_ABORTED'));
    });
  }finally{
    db.close();
  }
}

async function allMutations(){
  return withStore<OfflineCaptureMutation[]>('readonly',store=>store.getAll());
}

export async function pendingOfflineMutationCount(){
  if(typeof indexedDB==='undefined') return 0;
  const items=await allMutations();
  return items.filter(item=>Date.now()-item.createdAt<=MAX_AGE_MS).length;
}

export async function enqueueCaptureMutation(input:{
  householdId:string;
  sourceText:string;
  observedOn:string;
  scope:FinancialScope;
}){
  if(typeof indexedDB==='undefined') throw new Error('OFFLINE_QUEUE_UNAVAILABLE');
  const item:OfflineCaptureMutation={
    id:crypto.randomUUID(),
    kind:'capture_commit',
    householdId:input.householdId,
    sourceText:input.sourceText,
    observedOn:input.observedOn,
    scope:input.scope,
    createdAt:Date.now(),
    attempts:0
  };
  await withStore('readwrite',store=>store.put(item));
  return item;
}

async function removeMutation(id:string){
  await withStore('readwrite',store=>store.delete(id));
}

async function updateMutation(item:OfflineCaptureMutation){
  await withStore('readwrite',store=>store.put(item));
}

export type OfflineFlushResult={
  sent:number;
  duplicates:number;
  failed:number;
  remaining:number;
};

export async function flushOfflineCaptureMutations():Promise<OfflineFlushResult>{
  if(typeof indexedDB==='undefined'||typeof navigator==='undefined'||!navigator.onLine){
    return {sent:0,duplicates:0,failed:0,remaining:await pendingOfflineMutationCount()};
  }

  const token=await getBrowserAuthToken();
  const items=(await allMutations()).sort((a,b)=>a.createdAt-b.createdAt);
  let sent=0;
  let duplicates=0;
  let failed=0;

  for(const item of items){
    if(Date.now()-item.createdAt>MAX_AGE_MS){
      await removeMutation(item.id);
      failed++;
      continue;
    }

    try{
      const response=await fetch('/api/capture/commit',{
        method:'POST',
        headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
        body:JSON.stringify({
          householdId:item.householdId,
          sourceText:item.sourceText,
          observedOn:item.observedOn,
          scope:item.scope
        }),
        cache:'no-store'
      });

      const json=await response.json().catch(()=>({}));
      if(response.ok){
        await removeMutation(item.id);
        if(json.status==='duplicate') duplicates++;
        else sent++;
        continue;
      }

      // Permanent validation/auth failures are not retried forever.
      if(response.status>=400&&response.status<500&&response.status!==408&&response.status!==429){
        await removeMutation(item.id);
        failed++;
        continue;
      }

      item.attempts++;
      await updateMutation(item);
      break;
    }catch{
      item.attempts++;
      await updateMutation(item);
      break;
    }
  }

  return {sent,duplicates,failed,remaining:await pendingOfflineMutationCount()};
}
