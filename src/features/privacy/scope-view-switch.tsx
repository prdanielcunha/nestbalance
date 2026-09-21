'use client';
export type FinancialView='household'|'personal'|'all';

export function ScopeViewSwitch({value,onChange}:{value:FinancialView;onChange:(value:FinancialView)=>void}){
  return <div className="scope-view-switch" aria-label="Visão financeira">
    <button type="button" className={value==='household'?'active':''} onClick={()=>onChange('household')}>Lar</button>
    <button type="button" className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>Pessoal</button>
    <button type="button" className={value==='all'?'active':''} onClick={()=>onChange('all')}>Tudo</button>
  </div>;
}
export function inFinancialView(scope:'household'|'personal'|undefined,view:FinancialView){
  if(view==='all') return true;
  const normalized=scope==='personal'?'personal':'household';
  return normalized===view;
}
