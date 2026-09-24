'use client';
import type { ReactNode } from 'react';
import { AppNav } from '@/src/features/navigation/app-nav';

export function AuthenticatedShell({canContribute,children}:{canContribute:boolean;children:ReactNode}) {
  return <div className="authenticated-shell">
    <AppNav canContribute={canContribute}/>
    <div className="authenticated-content">{children}</div>
  </div>;
}
