'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localeForIntl, normalizeLocale, type AppLocale } from '@/src/core/locale';
import { messages } from './messages';

type MessageKey=keyof (typeof messages)['pt-BR'];
type MessageSet={readonly [K in MessageKey]:string};

type I18nContextValue={
  locale:AppLocale;
  intlLocale:string;
  currency:string;
  t:MessageSet;
  formatMoney:(minor:number)=>string;
  formatMoneyUnmasked:(minor:number)=>string;
  valuesHidden:boolean;
  toggleValues:()=>void;
  alwaysHideValues:boolean;
  setAlwaysHideValues:(value:boolean)=>void;
  formatDate:(value:Date|number|string,options?:Intl.DateTimeFormatOptions)=>string;
};

const fallback:I18nContextValue={
  locale:'pt-BR',
  intlLocale:'pt-BR',
  currency:'BRL',
  t:messages['pt-BR'] as MessageSet,
  formatMoney:minor=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100),
  formatMoneyUnmasked:minor=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100),
  valuesHidden:false,
  toggleValues:()=>undefined,
  alwaysHideValues:false,
  setAlwaysHideValues:()=>undefined,
  formatDate:(value,options)=>new Intl.DateTimeFormat('pt-BR',options).format(new Date(value))
};

const I18nContext=createContext<I18nContextValue>(fallback);

export function LocaleProvider({
  locale,
  currency='BRL',
  children
}:{locale:AppLocale|string;currency?:string;children:ReactNode}){
  const normalized=normalizeLocale(locale);
  const intlLocale=localeForIntl(normalized);
  const safeCurrency=/^[A-Z]{3}$/.test(currency)?currency:'BRL';
  const [valuesHidden,setValuesHidden]=useState(false);
  const [alwaysHideValues,setAlwaysHideState]=useState(false);

  useEffect(()=>{
    document.documentElement.lang=normalized;
    document.documentElement.dataset.locale=normalized;
    const always=localStorage.getItem('nestbalance-always-hide-values')==='1';
    const sessionHidden=sessionStorage.getItem('nestbalance-values-hidden')==='1';
    setAlwaysHideState(always);
    setValuesHidden(always||sessionHidden);
  },[normalized]);

  function toggleValues(){
    setValuesHidden(current=>{
      const next=!current;
      if(next) sessionStorage.setItem('nestbalance-values-hidden','1');
      else sessionStorage.removeItem('nestbalance-values-hidden');
      return next;
    });
  }

  function setAlwaysHideValues(value:boolean){
    setAlwaysHideState(value);
    if(value){
      localStorage.setItem('nestbalance-always-hide-values','1');
      sessionStorage.setItem('nestbalance-values-hidden','1');
      setValuesHidden(true);
    }else{
      localStorage.removeItem('nestbalance-always-hide-values');
    }
  }

  const value=useMemo<I18nContextValue>(()=>{
    const formatter=new Intl.NumberFormat(intlLocale,{style:'currency',currency:safeCurrency});
    const currencyMark=formatter.formatToParts(0).find(part=>part.type==='currency')?.value||safeCurrency;
    return {
      locale:normalized,
      intlLocale,
      currency:safeCurrency,
      t:messages[normalized] as MessageSet,
      formatMoney:minor=>valuesHidden?currencyMark+' ••••':formatter.format(minor/100),
      formatMoneyUnmasked:minor=>formatter.format(minor/100),
      valuesHidden,
      toggleValues,
      alwaysHideValues,
      setAlwaysHideValues,
      formatDate:(input,options)=>new Intl.DateTimeFormat(intlLocale,options).format(new Date(input))
    };
  },[normalized,intlLocale,safeCurrency,valuesHidden,alwaysHideValues]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){
  return useContext(I18nContext);
}
