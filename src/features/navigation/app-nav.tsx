'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/src/i18n/locale-provider';

export function AppNav({canContribute=true,desktopInline=false}:{canContribute?:boolean;desktopInline?:boolean}){
  const pathname=usePathname();
  const {t}=useI18n();
  const items=[
    {href:'/',label:t.navHome,className:''},
    {href:'/movements',label:t.navMovements,className:''},
    {href:'/accounts',label:t.navAccounts,className:'nav-accounts'},
    {href:'/pots',label:t.navPots,className:''},
    {href:'/assistant',label:t.navAssistant,className:''}
  ];
  return <nav className={desktopInline?'app-nav desktop-inline':'app-nav'} aria-label={t.navHome?`${t.navHome} · ${t.navMovements} · ${t.navAccounts} · ${t.navPots} · ${t.navAssistant}`:'Navegação principal'}>
    <div className="app-nav-track">
      {items.slice(0,2).map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?'page':undefined} className={`${pathname===item.href?'app-nav-link active':'app-nav-link'} ${item.className}`.trim()}>{item.label}</Link>)}
      {canContribute
        ? <Link href="/add" className="app-nav-add" aria-label={t.add}>＋<span>{t.add}</span></Link>
        : <span className="app-nav-add readonly" aria-disabled="true"><span>{t.readOnly}</span></span>}
      {items.slice(2).map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?'page':undefined} className={`${pathname===item.href?'app-nav-link active':'app-nav-link'} ${item.className}`.trim()}>{item.label}</Link>)}
    </div>
  </nav>;
}
