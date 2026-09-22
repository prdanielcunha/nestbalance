export type AppLocale='pt-BR'|'en'|'es';

export const supportedLocales:readonly AppLocale[]=['pt-BR','en','es'] as const;

export function normalizeLocale(value:unknown):AppLocale{
  const raw=String(value||'').trim().toLowerCase().replace('_','-');
  if(raw==='pt'||raw==='pt-br'||raw.startsWith('pt-')) return 'pt-BR';
  if(raw==='es'||raw.startsWith('es-')) return 'es';
  if(raw==='en'||raw.startsWith('en-')) return 'en';
  return 'pt-BR';
}

export function localeLabel(locale:AppLocale){
  if(locale==='en') return 'English';
  if(locale==='es') return 'Español';
  return 'Português (Brasil)';
}

export function localeForIntl(locale:AppLocale){
  return locale==='en'?'en-US':locale==='es'?'es-ES':'pt-BR';
}
