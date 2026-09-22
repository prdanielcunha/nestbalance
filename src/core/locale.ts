export type AppLocale='pt-BR'|'en'|'es';

export const supportedLocales:readonly AppLocale[]=['pt-BR','en','es'] as const;

export function parseLocale(value:unknown):AppLocale|null{
  const raw=String(value||'').trim().toLowerCase().replace('_','-');
  if(raw==='pt'||raw==='pt-br'||raw.startsWith('pt-')) return 'pt-BR';
  if(raw==='es'||raw.startsWith('es-')) return 'es';
  if(raw==='en'||raw.startsWith('en-')) return 'en';
  return null;
}

export function normalizeLocale(value:unknown):AppLocale{
  return parseLocale(value)||'pt-BR';
}

export function localeLabel(locale:AppLocale){
  if(locale==='en') return 'English';
  if(locale==='es') return 'Español';
  return 'Português (Brasil)';
}

export function localeForIntl(locale:AppLocale){
  return locale==='en'?'en-US':locale==='es'?'es-ES':'pt-BR';
}
