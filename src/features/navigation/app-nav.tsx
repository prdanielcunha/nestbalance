'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppLocale } from '@/src/i18n/locale-provider';

const copy={
  'pt-BR':{home:'Início',movements:'Movimentos',accounts:'Contas',vault:'Cofre',assistant:'Assistente',add:'Adicionar',readonly:'Somente leitura',aria:'Navegação principal'},
  en:{home:'Home',movements:'Activity',accounts:'Accounts',vault:'Vault',assistant:'Assistant',add:'Add',readonly:'Read only',aria:'Main navigation'},
  es:{home:'Inicio',movements:'Movimientos',accounts:'Cuentas',vault:'Cofre',assistant:'Asistente',add:'Agregar',readonly:'Solo lectura',aria:'Navegación principal'}
} as const;

export function AppNav({canContribute=true}:{canContribute?:boolean}){
  const pathname=usePathname();
  const {locale}=useAppLocale();
  const c=copy[locale];
  const items=[
    {href:'/',label:c.home},
    {href:'/movements',label:c.movements},
    {href:'/accounts',label:c.accounts},
    {href:'/vault',label:c.vault},
    {href:'/assistant',label:c.assistant}
  ];
  return <nav className="app-nav" aria-label={c.aria}>
    <div className="app-nav-track">
      {items.slice(0,2).map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?'page':undefined} className={pathname===item.href?'app-nav-link active':'app-nav-link'}>{item.label}</Link>)}
      {canContribute
        ? <Link href="/add" className="app-nav-add" aria-label={c.add}>＋<span>{c.add}</span></Link>
        : <span className="app-nav-add readonly" aria-disabled="true"><span>{c.readonly}</span></span>}
      {items.slice(2).map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?'page':undefined} className={pathname===item.href?'app-nav-link active':'app-nav-link'}>{item.label}</Link>)}
    </div>
  </nav>;
}
