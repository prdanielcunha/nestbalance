'use client';
import { createContext, useContext, useEffect } from 'react';
import { messages, normalizeLocale, type Locale } from './messages';

const LocaleContext=createContext<Locale>('pt-BR');

export function LocaleProvider({locale,children}:{locale:Locale;children:React.ReactNode}){
  useEffect(()=>{
    document.documentElement.lang=locale;
    try{window.localStorage.setItem('nestbalance.locale',locale);}catch{}
  },[locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useAppLocale(){
  const locale=useContext(LocaleContext);
  return {
    locale,
    t:messages[locale],
    money:new Intl.NumberFormat(locale==='en'?'en-US':locale,{style:'currency',currency:'BRL'}),
    date:new Intl.DateTimeFormat(locale==='en'?'en-US':locale),
    month:new Intl.DateTimeFormat(locale==='en'?'en-US':locale,{month:'long'})
  };
}

export function preferredBrowserLocale():Locale{
  if(typeof window==='undefined') return 'pt-BR';
  try{
    const stored=window.localStorage.getItem('nestbalance.locale');
    if(stored) return normalizeLocale(stored);
  }catch{}
  return normalizeLocale(window.navigator.language);
}
