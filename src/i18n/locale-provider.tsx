'use client';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { localeForIntl, normalizeLocale, type AppLocale } from '@/src/core/locale';
import { messages } from './messages';

type I18nContextValue={
  locale:AppLocale;
  intlLocale:string;
  currency:string;
  t:(typeof messages)['pt-BR'];
  formatMoney:(minor:number)=>string;
  formatDate:(value:Date|number|string,options?:Intl.DateTimeFormatOptions)=>string;
};

const fallback:I18nContextValue={
  locale:'pt-BR',
  intlLocale:'pt-BR',
  currency:'BRL',
  t:messages['pt-BR'],
  formatMoney:minor=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100),
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

  useEffect(()=>{
    document.documentElement.lang=normalized;
    document.documentElement.dataset.locale=normalized;
  },[normalized]);

  const value=useMemo<I18nContextValue>(()=>{
    const formatter=new Intl.NumberFormat(intlLocale,{style:'currency',currency:safeCurrency});
    return {
      locale:normalized,
      intlLocale,
      currency:safeCurrency,
      t:messages[normalized],
      formatMoney:minor=>formatter.format(minor/100),
      formatDate:(input,options)=>new Intl.DateTimeFormat(intlLocale,options).format(new Date(input))
    };
  },[normalized,intlLocale,safeCurrency]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){
  return useContext(I18nContext);
}
