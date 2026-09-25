'use client';

import { BrandLockup } from '@/src/features/brand/brand-lockup';

export function AppLoadingScreen({label}:{label:string}){
  return <main className="app-loading-screen" aria-busy="true">
    <section className="app-loading-stage" role="status" aria-live="polite">
      <BrandLockup className="app-loading-logo"/>
      <div className="app-loading-copy">
        <span>{label}</span>
        <div className="app-loading-progress" aria-hidden="true"><i/></div>
      </div>
    </section>
  </main>;
}
