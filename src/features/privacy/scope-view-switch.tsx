'use client';
import { useI18n } from '@/src/i18n/locale-provider';
export type FinancialView='household'|'personal'|'all';

export function ScopeViewSwitch({value,onChange}:{value:FinancialView;onChange:(value:FinancialView)=>void}){
  const {t}=useI18n();
  return <div className="scope-view-switch" aria-label="O que você quer visualizar">
    <button type="button" aria-label={`${t.scopeHousehold}: ${t.scopeHouseholdHint}`} className={value==='household'?'active':''} onClick={()=>onChange('household')}>
      <strong>{t.scopeHousehold}</strong><span>{t.scopeHouseholdHint}</span>
    </button>
    <button type="button" aria-label={`${t.scopePersonal}: ${t.scopePersonalHint}`} className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>
      <strong>{t.scopePersonal}</strong><span>{t.scopePersonalHint}</span>
    </button>
    <button type="button" aria-label={`${t.scopeAll}: ${t.scopeAllHint}`} className={value==='all'?'active':''} onClick={()=>onChange('all')}>
      <strong>{t.scopeAll}</strong><span>{t.scopeAllHint}</span>
    </button>
  </div>;
}
export function inFinancialView(scope:'household'|'personal'|undefined,view:FinancialView){
  if(view==='all') return true;
  const normalized=scope==='personal'?'personal':'household';
  return normalized===view;
}
