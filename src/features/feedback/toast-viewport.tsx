'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeToasts, type ToastRequest } from '@/src/features/feedback/toast-store';

export function ToastViewport(){
  const [toast,setToast]=useState<ToastRequest|null>(null);
  const [working,setWorking]=useState(false);
  const timerRef=useRef<number|undefined>(undefined);

  useEffect(()=>subscribeToasts(next=>{
    if(timerRef.current!==undefined) window.clearTimeout(timerRef.current);
    setWorking(false);
    setToast(next);
    timerRef.current=window.setTimeout(()=>setToast(null),next.durationMs??7000);
  }),[]);

  useEffect(()=>()=>{if(timerRef.current!==undefined) window.clearTimeout(timerRef.current);},[]);

  if(!toast) return null;

  return <div className="toast-viewport" aria-live="polite" aria-atomic="true">
    <div className="app-toast" role="status">
      <span>{toast.message}</span>
      {toast.actionLabel&&toast.onAction&&<button type="button" disabled={working} onClick={async()=>{
        setWorking(true);
        try{await toast.onAction();setToast(null);}
        finally{setWorking(false);}
      }}>{working?'…':toast.actionLabel}</button>}
      <button type="button" className="toast-close" aria-label="Fechar" onClick={()=>setToast(null)}>×</button>
    </div>
  </div>;
}
