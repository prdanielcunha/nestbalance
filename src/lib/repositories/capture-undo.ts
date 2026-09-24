'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';

export type CaptureUndoItem={id:string;entityType:'transaction'|'commitment'};

export async function undoCaptureBatch(householdId:string,items:CaptureUndoItem[]){
  const token=await getBrowserAuthToken();
  const response=await fetch('/api/capture/undo',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId,items}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'CAPTURE_UNDO_FAILED');
  return json as {ok:true;undone:number};
}
