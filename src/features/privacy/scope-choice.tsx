'use client';
import type { FinancialScope } from '@/src/core/privacy';
import { useI18n } from '@/src/i18n/locale-provider';

export function ScopeChoice({value,onChange,disabled=false}:{value:FinancialScope;onChange:(value:FinancialScope)=>void;disabled?:boolean}){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  return <div className="scope-choice-wrap">
    <div className="scope-choice-copy">
      <strong>{l('Onde este item deve aparecer?','Where should this item appear?','¿Dónde debe aparecer este elemento?')}</strong>
      <span>{l(
        'Lar é o espaço financeiro compartilhado da família. Você escolhe item por item o que fica compartilhado ou privado.',
        'Household is the family’s shared financial space. You decide item by item what is shared and what stays private.',
        'Hogar es el espacio financiero compartido de la familia. Tú decides elemento por elemento qué se comparte y qué queda privado.'
      )}</span>
    </div>
    <div className="scope-choice" aria-label={l('Quem pode ver','Who can see this','Quién puede verlo')}>
      <button type="button" disabled={disabled} className={value==='household'?'active':''} onClick={()=>onChange('household')}>
        <strong>{l('Compartilhado no Lar','Shared in Household','Compartido en el Hogar')}</strong>
        <span>{l(
          'Você e as pessoas convidadas para este Lar podem ver.',
          'You and the people invited to this Household can see it.',
          'Tú y las personas invitadas a este Hogar pueden verlo.'
        )}</span>
      </button>
      <button type="button" disabled={disabled} className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>
        <strong>{l('Privado — só eu','Private — only me','Privado — solo yo')}</strong>
        <span>{l(
          'Só você vê. Outros membros do Lar não veem este item.',
          'Only you can see it. Other Household members cannot see this item.',
          'Solo tú puedes verlo. Los demás miembros del Hogar no ven este elemento.'
        )}</span>
      </button>
    </div>
  </div>;
}
