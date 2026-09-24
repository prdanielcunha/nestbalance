'use client';

export type ToastRequest={
  message:string;
  actionLabel?:string;
  onAction?:()=>void|Promise<void>;
  durationMs?:number;
};

const EVENT='nestbalance:toast';

export function publishToast(toast:ToastRequest){
  if(typeof window==='undefined') return;
  window.dispatchEvent(new CustomEvent<ToastRequest>(EVENT,{detail:toast}));
}

export function subscribeToasts(listener:(toast:ToastRequest)=>void){
  if(typeof window==='undefined') return ()=>undefined;
  const handler=(event:Event)=>listener((event as CustomEvent<ToastRequest>).detail);
  window.addEventListener(EVENT,handler);
  return ()=>window.removeEventListener(EVENT,handler);
}
