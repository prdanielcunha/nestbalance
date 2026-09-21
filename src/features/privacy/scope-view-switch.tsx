'use client';
export type FinancialView='household'|'personal'|'all';

export function ScopeViewSwitch({value,onChange}:{value:FinancialView;onChange:(value:FinancialView)=>void}){
  return <div className="scope-view-switch" aria-label="O que você quer visualizar">
    <button type="button" aria-label="Lar: itens compartilhados" className={value==='household'?'active':''} onClick={()=>onChange('household')}>
      <strong>Lar</strong><span>compartilhado</span>
    </button>
    <button type="button" aria-label="Só eu: itens privados" className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>
      <strong>Só eu</strong><span>privado</span>
    </button>
    <button type="button" aria-label="Tudo: Lar mais os seus itens privados" className={value==='all'?'active':''} onClick={()=>onChange('all')}>
      <strong>Tudo</strong><span>Lar + meu privado</span>
    </button>
  </div>;
}
export function inFinancialView(scope:'household'|'personal'|undefined,view:FinancialView){
  if(view==='all') return true;
  const normalized=scope==='personal'?'personal':'household';
  return normalized===view;
}
