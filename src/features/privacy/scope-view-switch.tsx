'use client';
import { useAppLocale } from '@/src/i18n/locale-provider';

export type FinancialView='household'|'personal'|'all';

const copy={
  'pt-BR':{
    aria:'O que você quer visualizar',
    household:'Lar',householdHint:'compartilhado',householdAria:'Lar: itens compartilhados',
    personal:'Só eu',personalHint:'privado',personalAria:'Só eu: itens privados',
    all:'Tudo',allHint:'Lar + meu privado',allAria:'Tudo: Lar mais os seus itens privados'
  },
  en:{
    aria:'What do you want to view',
    household:'Household',householdHint:'shared',householdAria:'Household: shared items',
    personal:'Just me',personalHint:'private',personalAria:'Just me: private items',
    all:'Everything',allHint:'Household + my private',allAria:'Everything: Household plus your private items'
  },
  es:{
    aria:'Qué quieres ver',
    household:'Hogar',householdHint:'compartido',householdAria:'Hogar: elementos compartidos',
    personal:'Solo yo',personalHint:'privado',personalAria:'Solo yo: elementos privados',
    all:'Todo',allHint:'Hogar + mi privado',allAria:'Todo: Hogar más tus elementos privados'
  }
} as const;

export function ScopeViewSwitch({value,onChange}:{value:FinancialView;onChange:(value:FinancialView)=>void}){
  const {locale}=useAppLocale();
  const c=copy[locale];
  return <div className="scope-view-switch" aria-label={c.aria}>
    <button type="button" aria-label={c.householdAria} className={value==='household'?'active':''} onClick={()=>onChange('household')}>
      <strong>{c.household}</strong><span>{c.householdHint}</span>
    </button>
    <button type="button" aria-label={c.personalAria} className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>
      <strong>{c.personal}</strong><span>{c.personalHint}</span>
    </button>
    <button type="button" aria-label={c.allAria} className={value==='all'?'active':''} onClick={()=>onChange('all')}>
      <strong>{c.all}</strong><span>{c.allHint}</span>
    </button>
  </div>;
}
export function inFinancialView(scope:'household'|'personal'|undefined,view:FinancialView){
  if(view==='all') return true;
  const normalized=scope==='personal'?'personal':'household';
  return normalized===view;
}
