'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/src/i18n/locale-provider';
import { BrandLockup } from '@/src/features/brand/brand-lockup';

export function AppNav({
  canContribute=true,
  className='',
  collapsed=false,
  onToggle
}:{
  canContribute?:boolean;
  className?:string;
  collapsed?:boolean;
  onToggle?:()=>void;
}) {
  const pathname=usePathname();
  const {t,locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const items=[
    {href:'/',label:t.navHome,className:'',short:'I'},
    {href:'/movements',label:t.navMovements,className:'',short:'M'},
    {href:'/accounts',label:t.navAccounts,className:'nav-accounts',short:'C'},
    {href:'/pots',label:t.navPots,className:'',short:'$'},
    {href:'/assistant',label:t.navAssistant,className:'nav-assistant',short:'IA'}
  ];
  const navClassName=['app-nav',collapsed?'collapsed':'',className].filter(Boolean).join(' ');
  const ariaLabel=[t.navHome,t.navMovements,t.navAccounts,t.navPots,t.navAssistant].join(' · ');
  return <nav className={navClassName} aria-label={ariaLabel}>
    <div className="app-nav-head">
      <Link href="/" className="app-nav-brand" aria-label="NestBalance">
        <BrandLockup compact={collapsed}/>
      </Link>
      {onToggle&&<button
        type="button"
        className="app-nav-toggle"
        onClick={onToggle}
        aria-label={collapsed?l('Expandir navegação','Expand navigation','Expandir navegación'):l('Recolher navegação','Collapse navigation','Contraer navegación')}
        aria-expanded={!collapsed}
      >{collapsed?'›':'‹'}</button>}
    </div>
    <div className="app-nav-track">
      {items.slice(0,2).map(item=><Link key={item.href} title={collapsed?item.label:undefined} href={item.href} aria-current={pathname===item.href?'page':undefined} className={(pathname===item.href?'app-nav-link active':'app-nav-link')+' '+item.className}><span className="app-nav-short" aria-hidden="true">{item.short}</span><span className="app-nav-label">{item.label}</span></Link>)}
      {canContribute
        ? <Link href="/add" className="app-nav-add" title={collapsed?t.add:undefined} aria-label={t.add}>＋<span>{t.add}</span></Link>
        : <span className="app-nav-add readonly" aria-disabled="true"><span>{t.readOnly}</span></span>}
      {items.slice(2).map(item=><Link key={item.href} title={collapsed?item.label:undefined} href={item.href} aria-current={pathname===item.href?'page':undefined} className={(pathname===item.href?'app-nav-link active':'app-nav-link')+' '+item.className}><span className="app-nav-short" aria-hidden="true">{item.short}</span><span className="app-nav-label">{item.label}</span></Link>)}
    </div>
  </nav>;
}
