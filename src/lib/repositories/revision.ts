'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';
import type { SyncDomain } from '@/src/core/realtime';

export type HouseholdRevisionEvent={
  revision:string;
  domains:SyncDomain[];
  changedAt:number;
};

export async function loadHouseholdRevision(householdId:string){
  const token=await getBrowserAuthToken();
  const response=await fetch('/api/household/revision',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'HOUSEHOLD_REVISION_FAILED');
  return String(json.revision||'0');
}

function parseRevisionEvent(raw:string):HouseholdRevisionEvent|null{
  const line=raw.split('\n').find(item=>item.startsWith('data: '));
  if(!line) return null;
  try{
    const json=JSON.parse(line.slice(6));
    if(!json||typeof json.revision!=='string'||!Array.isArray(json.domains)) return null;
    return {
      revision:json.revision,
      domains:json.domains.filter((value:unknown)=>typeof value==='string') as SyncDomain[],
      changedAt:Number(json.changedAt)||Date.now()
    };
  }catch{
    return null;
  }
}

export async function streamHouseholdRevisions(
  householdId:string,
  signal:AbortSignal,
  onEvent:(event:HouseholdRevisionEvent)=>void
){
  const token=await getBrowserAuthToken();
  const response=await fetch('/api/household/revision/stream',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      accept:'text/event-stream',
      authorization:`Bearer ${token}`
    },
    body:JSON.stringify({householdId}),
    cache:'no-store',
    signal
  });
  if(!response.ok) throw new Error('HOUSEHOLD_REVISION_STREAM_FAILED');
  if(!response.body) throw new Error('HOUSEHOLD_REVISION_STREAM_UNAVAILABLE');

  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let buffer='';

  while(true){
    const {done,value}=await reader.read();
    if(done) break;
    buffer+=decoder.decode(value,{stream:true});
    let boundary=buffer.indexOf('\n\n');
    while(boundary>=0){
      const chunk=buffer.slice(0,boundary);
      buffer=buffer.slice(boundary+2);
      const event=parseRevisionEvent(chunk);
      if(event) onEvent(event);
      boundary=buffer.indexOf('\n\n');
    }
  }
}
