'use client';
import type { FinancialScope } from '@/src/core/privacy';

export function ScopeChoice({value,onChange,disabled=false}:{value:FinancialScope;onChange:(value:FinancialScope)=>void;disabled?:boolean}){
  return <div className="scope-choice" aria-label="Quem pode ver">
    <button type="button" disabled={disabled} className={value==='household'?'active':''} onClick={()=>onChange('household')}>
      <strong>Lar</strong><span>Compartilhado com quem tem acesso</span>
    </button>
    <button type="button" disabled={disabled} className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>
      <strong>Só para mim</strong><span>Visível apenas na sua conta</span>
    </button>
  </div>;
}
