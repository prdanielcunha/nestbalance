'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppNav } from '@/src/features/navigation/app-nav';

const NAV_STORAGE_KEY='nestbalance-nav-collapsed';

export function AuthenticatedShell({canContribute,children}:{canContribute:boolean;children:ReactNode}) {
  const [collapsed,setCollapsed]=useState(false);

  useEffect(()=>{
    try{ setCollapsed(localStorage.getItem(NAV_STORAGE_KEY)==='true'); }catch{}
  },[]);

  function toggle(){
    setCollapsed(value=>{
      const next=!value;
      try{ localStorage.setItem(NAV_STORAGE_KEY,String(next)); }catch{}
      return next;
    });
  }

  return <div className={collapsed?'authenticated-shell nav-collapsed':'authenticated-shell'}>
    <AppNav canContribute={canContribute} collapsed={collapsed} onToggle={toggle}/>
    <div className="authenticated-content">{children}</div>
  </div>;
}
