import type { AppLocale } from './locale.js';
export const ACCOUNT_TYPES = ['bank','wallet','cash'] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

export type AccountDraft = {
  name:string;
  type:AccountType;
  balanceMinor:number;
  currency:'BRL';
};

export type AccountValidation =
  | {ok:true;value:AccountDraft;dedupKey:string}
  | {ok:false;reason:'INVALID_NAME'|'INVALID_TYPE'|'INVALID_BALANCE'};

function normalizeName(value:string){
  return value.normalize('NFKC').replace(/\s+/g,' ').trim();
}

export function accountDedupKey(name:string,type:AccountType){
  return `${type}|${normalizeName(name).toLocaleLowerCase('pt-BR')}`;
}

export function validateAccountDraft(input:{name:unknown;type:unknown;balanceMinor:unknown}):AccountValidation{
  const name=normalizeName(typeof input.name==='string'?input.name:'');
  if(name.length<2||name.length>60) return {ok:false,reason:'INVALID_NAME'};
  if(!ACCOUNT_TYPES.includes(input.type as AccountType)) return {ok:false,reason:'INVALID_TYPE'};
  const balanceMinor=Number(input.balanceMinor);
  if(!Number.isSafeInteger(balanceMinor)||Math.abs(balanceMinor)>1_000_000_000_000) return {ok:false,reason:'INVALID_BALANCE'};
  const type=input.type as AccountType;
  return {ok:true,value:{name,type,balanceMinor,currency:'BRL'},dedupKey:accountDedupKey(name,type)};
}

export function parseMoneyInputToMinor(input:string,locale:AppLocale='pt-BR'):number|null{
  const cleaned=input
    .normalize('NFKC')
    .replace(/[\s\u00a0]/g,'')
    .replace(/^(?:R\$|BRL)/i,'')
    .trim();
  if(!cleaned) return null;
  const negative=cleaned.startsWith('-');
  const raw=negative?cleaned.slice(1):cleaned;
  if(!/^\d[\d.,]*$/.test(raw)) return null;

  let normalized:string|null=null;
  if(locale==='en'){
    if(/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(raw)) normalized=raw.replace(/,/g,'');
    else if(/^\d{1,3}(?:,\d{3})+$/.test(raw)) normalized=raw.replace(/,/g,'');
    else if(/^\d{1,15}(?:\.\d{1,2})?$/.test(raw)) normalized=raw;
  }else{
    if(/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(raw)) normalized=raw.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(?:\.\d{3})+$/.test(raw)) normalized=raw.replace(/\./g,'');
    else if(/^\d{1,15}(?:,\d{1,2})?$/.test(raw)) normalized=raw.replace(',','.');
    else if(/^\d{1,15}\.\d{1,2}$/.test(raw)) normalized=raw;
  }

  if(normalized===null) return null;
  const value=Number(normalized);
  if(!Number.isFinite(value)) return null;
  const minor=Math.round(value*100)*(negative?-1:1);
  return Number.isSafeInteger(minor)?minor:null;
}
