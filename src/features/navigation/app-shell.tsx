'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { AppNav } from '@/src/features/navigation/app-nav';
import { HouseholdLink } from '@/src/features/navigation/household-link';
import { useI18n } from '@/src/i18n/locale-provider';
import { subscribeSyncStatus, type SyncStatus } from '@/src/features/realtime/sync-status-store';
import { GlobalSearch } from '@/src/features/search/global-search';

type HouseholdLinkMode='default'|'detailed'|'none';

function SyncStatusChip(){
  const {locale}=useI18n();
  const [status,setStatus]=useState<SyncStatus>('synced');
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  useEffect(()=>subscribeSyncStatus(setStatus),[]);
  if(status==='synced') return null;
  const label=status==='offline'
    ? l('Sem conexão','Offline','Sin conexión')
    : status==='failed'
      ? l('Sync pausado','Sync paused','Sync pausado')
      : status==='pending'
        ? l('Alteração pendente','Pending change','Cambio pendiente')
        : status==='conflict'
          ? l('Conflito para revisar','Conflict to review','Conflicto para revisar')
          : status==='remote-change'
            ? l('Mudou em outro aparelho','Changed on another device','Cambió en otro dispositivo')
            : l('Atualizando…','Updating…','Actualizando…');
  return <span className={`sync-status-chip ${status}`} role="status" aria-live="polite"><i aria-hidden="true"/>{label}</span>;
}

export function AppShell({
  children,
  subtitle,
  className='',
  canContribute=true,
  headerActions,
  householdLink='default',
  navClassName=''
}:{
  children:ReactNode;
  subtitle:ReactNode;
  className?:string;
  canContribute?:boolean;
  headerActions?:ReactNode;
  householdLink?:HouseholdLinkMode;
  navClassName?:string;
}){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const mainClass=['app-shell','app-shell-frame',className].filter(Boolean).join(' ');
  const navClass=['app-shell-nav',navClassName].filter(Boolean).join(' ');

  return <main className={mainClass}>
    <header className="topbar app-shell-topbar">
      <div className="app-shell-brand">
        <div className="eyebrow">NestBalance</div>
        <span className="topbar-subtitle">{subtitle}</span>
      </div>
      <div className="topbar-actions app-shell-actions">
        <Link className="inbox-shortcut" href="/inbox">{l('Caixa de entrada','Inbox','Bandeja')}</Link>
        <GlobalSearch/>
        <SyncStatusChip/>
        {headerActions}
        {householdLink!=='none'&&<HouseholdLink detailed={householdLink==='detailed'}/>}
      </div>
    </header>

    <AppNav canContribute={canContribute} desktopInline className={navClass}/>
    <div className="app-shell-content">{children}</div>
  </main>;
}
