'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items=[
  {href:'/',label:'Início'},
  {href:'/movements',label:'Movimentos'},
  {href:'/accounts',label:'Contas'},
  {href:'/vault',label:'Cofre'},
  {href:'/assistant',label:'Assistente'}
];

export function AppNav(){
  const pathname=usePathname();
  return <nav className="app-nav" aria-label="Navegação principal">
    <div className="app-nav-track">
      {items.slice(0,2).map(item=><Link key={item.href} href={item.href} className={pathname===item.href?'app-nav-link active':'app-nav-link'}>{item.label}</Link>)}
      <Link href="/add" className="app-nav-add" aria-label="Adicionar">＋<span>Adicionar</span></Link>
      {items.slice(2).map(item=><Link key={item.href} href={item.href} className={pathname===item.href?'app-nav-link active':'app-nav-link'}>{item.label}</Link>)}
    </div>
  </nav>;
}
