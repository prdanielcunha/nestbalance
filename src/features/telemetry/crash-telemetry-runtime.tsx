'use client';

import { useEffect } from 'react';
import { reportProductEvent } from '@/src/lib/product-events';

function report(kind:'error'|'unhandledrejection'){
  if(process.env.NEXT_PUBLIC_NESTBALANCE_E2E==='true') return;
  const payload=JSON.stringify({
    kind,
    route:window.location.pathname,
    online:navigator.onLine
  });
  void fetch('/api/metrics/client-crash',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:payload,
    keepalive:true,
    credentials:'omit'
  }).catch(()=>undefined);
}

export function CrashTelemetryRuntime(){
  useEffect(()=>{
    const sessionKey='nestbalance-session-observed';
    if(!sessionStorage.getItem(sessionKey)){
      sessionStorage.setItem(sessionKey,'1');
      reportProductEvent('session_observed');
    }
    const onError=()=>report('error');
    const onRejection=()=>report('unhandledrejection');
    window.addEventListener('error',onError);
    window.addEventListener('unhandledrejection',onRejection);
    return ()=>{
      window.removeEventListener('error',onError);
      window.removeEventListener('unhandledrejection',onRejection);
    };
  },[]);
  return null;
}
