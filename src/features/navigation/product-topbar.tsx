'use client';
import type { ReactNode } from 'react';
import { BrandLockup } from '@/src/features/brand/brand-lockup';
import { HouseholdLink } from '@/src/features/navigation/household-link';

export function ProductTopbar({
  section,
  children,
  showHousehold=true,
  detailedHousehold=true,
  className=''
}:{
  section:string;
  children?:ReactNode;
  showHousehold?:boolean;
  detailedHousehold?:boolean;
  className?:string;
}){
  return <header className={['topbar','product-topbar',className].filter(Boolean).join(' ')}>
    <div className="product-topbar-brand">
      <BrandLockup className="product-topbar-logo"/>
      <span className="topbar-subtitle">{section}</span>
    </div>
    <div className="topbar-actions">
      {children}
      {showHousehold&&<HouseholdLink detailed={detailedHousehold}/>}
    </div>
  </header>;
}
