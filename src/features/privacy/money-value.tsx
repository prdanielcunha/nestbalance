'use client';
import {maskMoneyInText} from '@/src/core/value-privacy';
import {useI18n} from '@/src/i18n/locale-provider';
import {useValuesVisibility} from './values-visibility-provider';

function Eye({hidden}:{hidden:boolean}){
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{hidden&&<path d="m3 3 18 18"/>}</svg>;
}
export function ValuesVisibilityToggle(){
  const {locale}=useI18n();
  const {allHidden,toggleAll}=useValuesVisibility();
  const label=allHidden?(locale==='en'?'Show all values':locale==='es'?'Mostrar todos los valores':'Mostrar todos os valores'):(locale==='en'?'Hide all values':locale==='es'?'Ocultar todos los valores':'Ocultar todos os valores');
  return <button className="values-visibility-toggle" type="button" aria-label={label} title={label} aria-pressed={allHidden} onClick={toggleAll}><Eye hidden={allHidden}/><span>{allHidden?(locale==='en'?'Show':locale==='es'?'Mostrar':'Mostrar'):(locale==='en'?'Hide':locale==='es'?'Ocultar':'Ocultar')}</span></button>;
}
export function MoneyValue({id,minor,label,currency,className=''}:{id:string;minor:number|null;label:string;currency?:string;className?:string}){
  const {intlLocale,locale,currency:defaultCurrency}=useI18n();
  const {isHidden,toggleValue}=useValuesVisibility();
  const hidden=isHidden(id);
  const action=hidden?(locale==='en'?'Show':locale==='es'?'Mostrar':'Mostrar'):(locale==='en'?'Hide':locale==='es'?'Ocultar':'Ocultar');
  return <span className={`money-value ${className}`} data-hidden={hidden?'true':'false'}>
    <span className="money-value-amount">{hidden?<span aria-label={locale==='en'?'Hidden value':locale==='es'?'Valor oculto':'Valor oculto'}>••••</span>:minor===null?'—':new Intl.NumberFormat(intlLocale,{style:'currency',currency:currency||defaultCurrency}).format(minor/100)}</span>
    <button className="money-value-toggle" type="button" aria-label={`${action}: ${label}`} aria-pressed={hidden} title={`${action}: ${label}`} onClick={event=>{event.stopPropagation();toggleValue(id);}}><Eye hidden={hidden}/></button>
  </span>;
}

export function usePrivateText(){
  const {hidden}=useValuesVisibility();
  return (text:string)=>hidden?maskMoneyInText(text):text;
}
