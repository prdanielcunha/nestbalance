'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/src/i18n/locale-provider';
import { BrandLockup } from '@/src/features/brand/brand-lockup';

export function AppNav({canContribute=true,className=''}:{canContribute?:boolean;className?:string}) {
  const pathname=usePathname();
  const {t}=useI18n();
  const items=[
    {href:'/',label:t.navHome,className:''},
    {href:'/movements',label:t.navMovements,className:''},
    {href:'/accounts',label:t.navAccounts,className:'nav-accounts'},
    {href:'/pots',label:t.navPots,className:''},
    {href:'/assistant',label:t.navAssistant,className:'nav-assistant'}
  ];
  const navClassName=['app-nav',className].filter(Boolean).join(' ');
  const ariaLabel=[t.navHome,t.navMovements,t.navAccounts,t.navPots,t.navAssistant].join(' · ');
  return <nav className={navClassName} aria-label={ariaLabel}>
    <Link href="/" className="app-nav-brand" aria-label="NestBalance">
      <BrandLockup/>
    </Link>
    <div className="app-nav-track">
      {items.slice(0,2).map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?'page':undefined} className={(pathname===item.href?'app-nav-link active':'app-nav-link')+' '+item.className}>{item.label}</Link>)}
      {canContribute
        ? <Link href="/add" className="app-nav-add" aria-label={t.add}>＋<span>{t.add}</span></Link>
        : <span className="app-nav-add readonly" aria-disabled="true"><span>{t.readOnly}</span></span>}
      {items.slice(2).map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?'page':undefined} className={(pathname===item.href?'app-nav-link active':'app-nav-link')+' '+item.className}>{item.label}</Link>)}
    </div>
  </nav>;
}
