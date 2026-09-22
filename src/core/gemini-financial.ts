import { detectDocumentSignals } from './document-signals.js';
import type {
  AiFinancialDirection,
  AiFinancialExtraction,
  AiFinancialScreenSnapshot
} from './ai-financial.js';

const directions:AiFinancialDirection[]=['expense','income','transfer','unknown'];
const documentTypes= new Set(['pix_receipt','bill','receipt','invoice','bank_screenshot','card_statement','other']);
const paymentMethods=new Set(['pix','card','cash','boleto','transfer','other']);
const screenTypes=new Set(['single_event','account_home','transaction_list','card_home','card_statement','retail_account','savings_pots','mixed','other']);

function str(value:unknown,max=160){
  const text=typeof value==='string'?value.normalize('NFKC').replace(/\s+/g,' ').trim():'';
  return text?text.slice(0,max):null;
}
function conf(value:unknown){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
}
function boolOrNull(value:unknown){
  return typeof value==='boolean'?value:null;
}
function safeMinor(value:unknown){
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>0&&n<=1_000_000_000_000?n:null;
}
function safeDate(value:unknown,allowed:Set<string>){
  const v=str(value,10);
  return v&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&allowed.has(v)?v:null;
}
function safeLast4(value:unknown,text:string){
  const digits=String(value??'').replace(/\D/g,'');
  if(!/^\d{4}$/.test(digits)) return null;
  return text.includes(digits)?digits:null;
}
function groundedLabel(value:unknown,text:string,max=80){
  const candidate=str(value,max);
  if(!candidate) return null;
  const plain=(input:string)=>input.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return plain(text).includes(plain(candidate))?candidate:null;
}
function parseLooseMoney(raw:string){
  let value=raw.replace(/\s/g,'').replace(/^R\$/i,'');
  if(value.includes(',')){
    const at=value.lastIndexOf(',');
    const integer=value.slice(0,at).replace(/\./g,'');
    const fraction=value.slice(at+1);
    if(!/^\d+$/.test(integer)||!/^\d{1,2}$/.test(fraction)) return null;
    return Number(integer)*100+Number(fraction.padEnd(2,'0'));
  }
  if(/^\d+\.\d{1,2}$/.test(value)){
    const [i,f]=value.split('.');
    return Number(i)*100+Number(f.padEnd(2,'0'));
  }
  return null;
}
function moneyEvidence(text:string){
  const set=new Set<number>();
  const signals=detectDocumentSignals(text);
  for(const signal of signals.candidates){
    if(signal.kind==='money'&&Number.isSafeInteger(signal.amountMinor)) set.add(signal.amountMinor!);
  }
  for(const match of text.matchAll(/(?:R\$\s*)?\b\d{1,3}(?:\.\d{3})*,\d{2}\b|(?:R\$\s*)?\b\d+\.\d{2}\b/g)){
    const amount=parseLooseMoney(match[0]);
    if(Number.isSafeInteger(amount)&&amount!>0) set.add(amount!);
  }
  return set;
}
function groundedMinor(value:unknown,allowed:Set<number>){
  const n=safeMinor(value);
  return n!==null&&allowed.has(n)?n:null;
}
function installments(text:string){
  const set=new Set<string>();
  for(const signal of detectDocumentSignals(text).candidates){
    if(signal.kind==='installment') set.add(`${signal.installmentCurrent}/${signal.installmentTotal}`);
  }
  return set;
}
function dates(text:string){
  const set=new Set<string>();
  for(const signal of detectDocumentSignals(text).candidates){
    if(signal.kind==='date') set.add(signal.normalized);
  }
  return set;
}
function enumValue<T extends string>(value:unknown,allowed:readonly T[],fallback:T):T{
  return typeof value==='string'&&allowed.includes(value as T)?value as T:fallback;
}
function installment(value:any,allowed:Set<string>){
  if(!value||typeof value!=='object') return null;
  const current=Number(value.current),total=Number(value.total);
  const key=`${current}/${total}`;
  return Number.isInteger(current)&&Number.isInteger(total)&&current>=1&&total>=current&&total<=120&&allowed.has(key)?{current,total}:null;
}
function array(value:unknown,max:number){
  return Array.isArray(value)?value.slice(0,max):[];
}

function sanitizeScreen(raw:any,text:string):AiFinancialScreenSnapshot|null{
  if(!raw||typeof raw!=='object') return null;
  const money=moneyEvidence(text),dateSet=dates(text),installmentSet=installments(text);
  const accounts=array(raw.accounts,12).map((item:any)=>({
    name:str(item?.name,80)||'Conta',
    productType:enumValue(item?.productType,['account','wallet','savings','investment'] as const,'account'),
    balanceMinor:groundedMinor(item?.balanceMinor,money)??0,
    currency:enumValue(item?.currency,['BRL','USD','EUR'] as const,'BRL'),
    confidence:conf(item?.confidence),
    last4:safeLast4(item?.last4,text)
  })).filter(item=>item.balanceMinor>0);

  const pots=array(raw.pots,12).map((item:any)=>({
    name:str(item?.name,80)||'Dinheiro guardado',
    balanceMinor:groundedMinor(item?.balanceMinor,money)??0,
    goalMinor:groundedMinor(item?.goalMinor,money),
    targetDate:safeDate(item?.targetDate,dateSet),
    currency:enumValue(item?.currency,['BRL','USD','EUR'] as const,'BRL'),
    confidence:conf(item?.confidence)
  })).filter(item=>item.balanceMinor>0);

  const cards=array(raw.cards,12).map((item:any)=>({
    name:str(item?.name,80)||'Cartão',
    last4:safeLast4(item?.last4,text),
    statementAmountMinor:groundedMinor(item?.statementAmountMinor,money),
    dueOn:safeDate(item?.dueOn,dateSet),
    availableLimitMinor:groundedMinor(item?.availableLimitMinor,money),
    totalLimitMinor:groundedMinor(item?.totalLimitMinor,money),
    confidence:conf(item?.confidence)
  })).filter(item=>item.statementAmountMinor!==null||item.availableLimitMinor!==null||item.totalLimitMinor!==null||item.last4);

  const commitments=array(raw.commitments,20).map((item:any)=>({
    description:str(item?.description,120)||'Conta',
    amountMinor:groundedMinor(item?.amountMinor,money)??0,
    dueOn:safeDate(item?.dueOn,dateSet),
    installment:installment(item?.installment,installmentSet),
    confidence:conf(item?.confidence),
    needsReview:Boolean(item?.needsReview)
  })).filter(item=>item.amountMinor>0);

  const movements=array(raw.movements,40).map((item:any)=>({
    description:str(item?.description,120)||'Movimento',
    amountMinor:groundedMinor(item?.amountMinor,money)??0,
    direction:enumValue(item?.direction,directions,'unknown'),
    dateIso:safeDate(item?.dateIso,dateSet),
    confidence:conf(item?.confidence),
    needsReview:Boolean(item?.needsReview)||enumValue(item?.direction,directions,'unknown')==='unknown',
    visibleText:str(item?.visibleText,220)||''
  })).filter(item=>item.amountMinor>0);

  const total=accounts.length+pots.length+cards.length+commitments.length+movements.length;
  if(!total) return null;
  return {
    screenType:enumValue(raw.screenType,[...screenTypes] as any,'other') as AiFinancialScreenSnapshot['screenType'],
    institution:groundedLabel(raw.institution,text,80),
    accounts,pots,cards,commitments,movements,
    summary:str(raw.summary,240)||'Dados financeiros extraídos do texto visível.'
  };
}

export function sanitizeGeminiFinancialExtraction(raw:any,text:string):AiFinancialExtraction{
  const money=moneyEvidence(text);
  const dateSet=dates(text);
  const installmentSet=installments(text);
  const amountMinor=groundedMinor(raw?.amountMinor,money);
  const amountCandidates=array(raw?.amountCandidatesMinor,8)
    .map(value=>groundedMinor(value,money))
    .filter((value):value is number=>value!==null);
  const installmentValue=installment(raw?.installment,installmentSet);
  const direction=enumValue(raw?.direction,directions,'unknown');
  const directionConfidence=conf(raw?.directionConfidence);
  const amountConfidence=amountMinor!==null?conf(raw?.amountConfidence):0;
  const description=str(raw?.description,120);
  const descriptionConfidence=description?conf(raw?.descriptionConfidence):0;
  const screen=sanitizeScreen(raw?.screen,text);

  const needsConfirmation=Boolean(raw?.needsConfirmation)||
    amountMinor===null||
    direction==='unknown'||
    directionConfidence<0.82||
    amountConfidence<0.82;

  return {
    documentType:documentTypes.has(raw?.documentType)?raw.documentType:'other',
    description,
    descriptionConfidence,
    amountMinor,
    amountConfidence,
    amountCandidatesMinor:[...new Set(amountCandidates)].slice(0,5),
    direction,
    directionConfidence,
    dateIso:safeDate(raw?.dateIso,dateSet),
    time:null,
    merchant:str(raw?.merchant,100),
    payer:null,
    payee:null,
    institution:groundedLabel(raw?.institution,text,80),
    paymentMethod:paymentMethods.has(raw?.paymentMethod)?raw.paymentMethod:null,
    transactionId:null,
    pixE2e:null,
    installment:installmentValue,
    recurringLikely:boolOrNull(raw?.recurringLikely),
    subscriptionLikely:boolOrNull(raw?.subscriptionLikely),
    overallConfidence:conf(raw?.overallConfidence),
    needsConfirmation,
    ambiguities:array(raw?.ambiguities,8).map(value=>str(value,140)).filter((value):value is string=>Boolean(value)),
    evidenceSummary:str(raw?.evidenceSummary,220)||'Interpretação de OCR sanitizado.',
    screen
  };
}
