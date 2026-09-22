'use client';
import { useEffect } from 'react';

export function PwaRuntime(){
  useEffect(()=>{
    if(!('serviceWorker' in navigator)) return;
    let cancelled=false;
    const register=async()=>{
      try{
        const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
        if(cancelled) return;
        void registration.update().catch(()=>undefined);
      }catch{
        // PWA enhancement must never block finance usage.
      }
    };
    if(document.readyState==='complete') void register();
    else window.addEventListener('load',register,{once:true});
    return ()=>{
      cancelled=true;
      window.removeEventListener('load',register);
    };
  },[]);
  return null;
}
