'use client';
import type { FinancialScope } from '@/src/core/privacy';

export function ScopeChoice({value,onChange,disabled=false}:{value:FinancialScope;onChange:(value:FinancialScope)=>void;disabled?:boolean}){
  return <div className="scope-choice-wrap">
    <div className="scope-choice-copy">
      <strong>Onde este item deve aparecer?</strong>
      <span>Lar é o espaço financeiro compartilhado da família. Você escolhe item por item o que fica compartilhado ou privado.</span>
    </div>
    <div className="scope-choice" aria-label="Quem pode ver">
      <button type="button" disabled={disabled} className={value==='household'?'active':''} onClick={()=>onChange('household')}>
        <strong>Compartilhado no Lar</strong>
        <span>Você e as pessoas convidadas para este Lar podem ver.</span>
      </button>
      <button type="button" disabled={disabled} className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>
        <strong>Privado — só eu</strong>
        <span>Só você vê. Outros membros do Lar não veem este item.</span>
      </button>
    </div>
  </div>;
}
