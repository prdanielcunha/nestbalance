'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/src/i18n/locale-provider';

export function AppNav({canContribute=true}:{canContribute?:boolean}){
  const pathname=usePathname();
  const {t}=useI18n();
  const items=[
    {href:'/',label:t.navHome},
    {href:'/movements',label:t.navMovements},
    {href:'/pots',label:t.navPots},
    {href:'/assistant',label:t.navAssistant}
  ];
  return <nav className="app-nav" aria-label="Navegação principal">
    <div className="app-nav-track">
      {items.slice(0,2).map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?'page':undefined} className={pathname===item.href?'app-nav-link active':'app-nav-link'}>{item.label}</Link>)}
      {canContribute
        ? <Link href="/add" className="app-nav-add" aria-label={t.add}>＋<span>{t.add}</span></Link>
        : <span className="app-nav-add readonly" aria-disabled="true"><span>{t.readOnly}</span></span>}
      {items.slice(2).map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?'page':undefined} className={pathname===item.href?'app-nav-link active':'app-nav-link'}>{item.label}</Link>)}
    </div>
  </nav>;
}
