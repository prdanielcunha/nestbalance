'use client';
import { useEffect, useState } from 'react';
import { normalizeTheme, THEME_STORAGE_KEY, themeColor, type AppTheme } from '@/src/core/theme';
import { useI18n } from '@/src/i18n/locale-provider';

function applyTheme(theme:AppTheme,persist:boolean){
  const root=document.documentElement;
  root.dataset.theme=theme;
  root.style.colorScheme=theme;
  if(persist){
    try{ localStorage.setItem(THEME_STORAGE_KEY,theme); }catch{}
  }
  let meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if(!meta){
    meta=document.createElement('meta');
    meta.name='theme-color';
    document.head.appendChild(meta);
  }
  meta.content=themeColor(theme);
}

function currentTheme():AppTheme{
  try{ return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)); }
  catch{ return 'dark'; }
}

export function ThemeRuntime(){
  useEffect(()=>{
    applyTheme(currentTheme(),false);
    const onStorage=(event:StorageEvent)=>{
      if(event.key===THEME_STORAGE_KEY) applyTheme(normalizeTheme(event.newValue),false);
    };
    window.addEventListener('storage',onStorage);
    return ()=>window.removeEventListener('storage',onStorage);
  },[]);
  return null;
}

export function ThemeChoice(){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [theme,setTheme]=useState<AppTheme>('dark');

  useEffect(()=>setTheme(currentTheme()),[]);

  function choose(next:AppTheme){
    setTheme(next);
    applyTheme(next,true);
  }

  return <div className="theme-choice" role="group" aria-label={l('Aparência','Appearance','Apariencia')}>
    <button type="button" className={theme==='dark'?'active':''} aria-pressed={theme==='dark'} onClick={()=>choose('dark')}>
      <span className="theme-preview theme-preview-dark" aria-hidden="true"><i/><i/><i/></span>
      <span><strong>{l('Escuro','Dark','Oscuro')}</strong><small>{l('Visual oficial do NestBalance','Official NestBalance look','Aspecto oficial de NestBalance')}</small></span>
      <b>{theme==='dark'?l('Ativo','On','Activo'):''}</b>
    </button>
    <button type="button" className={theme==='light'?'active':''} aria-pressed={theme==='light'} onClick={()=>choose('light')}>
      <span className="theme-preview theme-preview-light" aria-hidden="true"><i/><i/><i/></span>
      <span><strong>{l('Claro','Light','Claro')}</strong><small>{l('Para quem prefere fundo claro','For those who prefer a light background','Para quien prefiere fondo claro')}</small></span>
      <b>{theme==='light'?l('Ativo','On','Activo'):''}</b>
    </button>
  </div>;
}
