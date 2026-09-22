'use client';
import type { FinancialScope } from '@/src/core/privacy';
import { useAppLocale } from '@/src/i18n/locale-provider';

const copy={
  'pt-BR':{
    title:'Onde este item deve aparecer?',
    body:'Lar é o espaço financeiro compartilhado da família. Você escolhe item por item o que fica compartilhado ou privado.',
    aria:'Quem pode ver',
    household:'Compartilhado no Lar',householdHint:'Você e as pessoas convidadas para este Lar podem ver.',
    personal:'Privado — só eu',personalHint:'Só você vê. Outros membros do Lar não veem este item.'
  },
  en:{
    title:'Where should this item appear?',
    body:'Household is your family’s shared financial space. You choose item by item what stays shared or private.',
    aria:'Who can see this',
    household:'Shared with Household',householdHint:'You and people invited to this Household can see it.',
    personal:'Private — just me',personalHint:'Only you can see it. Other Household members cannot.'
  },
  es:{
    title:'¿Dónde debe aparecer este elemento?',
    body:'Hogar es el espacio financiero compartido de la familia. Tú decides elemento por elemento qué queda compartido o privado.',
    aria:'Quién puede verlo',
    household:'Compartido en el Hogar',householdHint:'Tú y las personas invitadas a este Hogar pueden verlo.',
    personal:'Privado — solo yo',personalHint:'Solo tú lo ves. Los demás miembros del Hogar no pueden verlo.'
  }
} as const;

export function ScopeChoice({value,onChange,disabled=false}:{value:FinancialScope;onChange:(value:FinancialScope)=>void;disabled?:boolean}){
  const {locale}=useAppLocale();
  const c=copy[locale];
  return <div className="scope-choice-wrap">
    <div className="scope-choice-copy">
      <strong>{c.title}</strong>
      <span>{c.body}</span>
    </div>
    <div className="scope-choice" aria-label={c.aria}>
      <button type="button" disabled={disabled} className={value==='household'?'active':''} onClick={()=>onChange('household')}>
        <strong>{c.household}</strong>
        <span>{c.householdHint}</span>
      </button>
      <button type="button" disabled={disabled} className={value==='personal'?'active':''} onClick={()=>onChange('personal')}>
        <strong>{c.personal}</strong>
        <span>{c.personalHint}</span>
      </button>
    </div>
  </div>;
}
