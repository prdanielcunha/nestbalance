'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/src/i18n/locale-provider';

export type FinancialView='household'|'personal'|'all';
const VIEW_STORAGE_KEY='nestbalance-financial-view';

function normalizeView(value:unknown):FinancialView{
  return value==='personal'||value==='all'?'personal'===value?'personal':'all':'household';
}

export function useFinancialView(){
  const [view,setViewState]=useState<FinancialView>('household');

  useEffect(()=>{
    try{ setViewState(normalizeView(localStorage.getItem(VIEW_STORAGE_KEY))); }catch{}
    const onStorage=(event:StorageEvent)=>{
      if(event.key===VIEW_STORAGE_KEY) setViewState(normalizeView(event.newValue));
    };
    window.addEventListener('storage',onStorage);
    return ()=>window.removeEventListener('storage',onStorage);
  },[]);

  function setView(next:FinancialView){
    setViewState(next);
    try{ localStorage.setItem(VIEW_STORAGE_KEY,next); }catch{}
  }

  return [view,setView] as const;
}

export function ScopeViewSwitch({value,onChange}:{value:FinancialView;onChange:(value:FinancialView)=>void}) {
  const {t,locale}=useI18n();
  const ariaLabel=locale==='en'?'What do you want to view?':locale==='es'?'¿Qué quieres ver?':'O que você quer visualizar?';
  return <div className="scope-view-switch" role="group" aria-label={ariaLabel}>
    <button type="button" aria-pressed={value==='personal'} aria-label={t.scopePersonal+': '+t.scopePersonalHint} className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>
      <strong>{t.scopePersonal}</strong><span>{t.scopePersonalHint}</span>
    </button>
    <button type="button" aria-pressed={value==='household'} aria-label={t.scopeHousehold+': '+t.scopeHouseholdHint} className={value==='household'?'active':''} onClick={()=>onChange('household')}>
      <strong>{t.scopeHousehold}</strong><span>{t.scopeHouseholdHint}</span>
    </button>
    <button type="button" aria-pressed={value==='all'} aria-label={t.scopeAll+': '+t.scopeAllHint} className={value==='all'?'active':''} onClick={()=>onChange('all')}>
      <strong>{t.scopeAll}</strong><span>{t.scopeAllHint}</span>
    </button>
  </div>;
}

export function inFinancialView(scope:'household'|'personal'|undefined,view:FinancialView){
  if(view==='all') return true;
  const normalized=scope==='personal'?'personal':'household';
  return normalized===view;
}
