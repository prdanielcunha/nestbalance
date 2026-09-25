export const THEME_STORAGE_KEY='nestbalance-theme';

export type AppTheme='dark'|'light';

export function normalizeTheme(value:unknown):AppTheme{
  return value==='light'?'light':'dark';
}

export function themeColor(theme:AppTheme){
  return theme==='light'?'#F7F3EA':'#090B10';
}
