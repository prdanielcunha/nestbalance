import type { CardBrand } from './cards.js';

export type LocalCardReadResult={
  brand:CardBrand;
  last4:string|null;
  institutionName:string|null;
  cardName:string|null;
  closingDay:number|null;
  dueDay:number|null;
  totalLimitMinor:number|null;
};

function plain(value:string){
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function validDay(value:unknown){
  const day=Number(value);
  return Number.isInteger(day)&&day>=1&&day<=31?day:null;
}

function parseMoney(value:string){
  const compact=value.replace(/\s/g,'').replace(/^r\$/i,'');
  const normalized=compact.includes(',')
    ? compact.replace(/\./g,'').replace(',','.')
    : compact;
  const amount=Number(normalized);
  if(!Number.isFinite(amount)||amount<0||amount>100_000_000) return null;
  const minor=Math.round(amount*100);
  return Number.isSafeInteger(minor)?minor:null;
}

function cardNumberCandidates(text:string){
  const matches=text.match(/(?:\d[ -]?){13,19}/g)||[];
  return matches
    .map(value=>value.replace(/\D/g,''))
    .filter(value=>value.length>=13&&value.length<=19);
}

function mastercardRange(digits:string){
  const first2=Number(digits.slice(0,2));
  const first4=Number(digits.slice(0,4));
  return (first2>=51&&first2<=55)||(first4>=2221&&first4<=2720);
}

function eloRange(digits:string){
  const prefixes=['4011','431274','438935','451416','457393','457631','457632','504175','627780','636297','636368'];
  if(prefixes.some(prefix=>digits.startsWith(prefix))) return true;
  const first6=Number(digits.slice(0,6));
  return (
    (first6>=506699&&first6<=506778)||
    (first6>=509000&&first6<=509999)||
    (first6>=650031&&first6<=650033)||
    (first6>=650035&&first6<=650051)||
    (first6>=650405&&first6<=650439)||
    (first6>=650485&&first6<=650538)||
    (first6>=650541&&first6<=650598)||
    (first6>=650700&&first6<=650718)||
    (first6>=650720&&first6<=650727)||
    (first6>=650901&&first6<=650978)||
    (first6>=651652&&first6<=651679)||
    (first6>=655000&&first6<=655019)||
    (first6>=655021&&first6<=655058)
  );
}

export function inferCardBrandFromText(text:string):CardBrand{
  const normalized=plain(text);
  if(normalized.includes('mastercard')||normalized.includes('master card')) return 'mastercard';
  if(normalized.includes('american express')||/\bamex\b/.test(normalized)) return 'amex';
  if(/\belo\b/.test(normalized)) return 'elo';
  if(/\bvisa\b/.test(normalized)) return 'visa';

  for(const digits of cardNumberCandidates(text)){
    if(/^3[47]/.test(digits)) return 'amex';
    if(eloRange(digits)) return 'elo';
    if(mastercardRange(digits)) return 'mastercard';
    if(/^4/.test(digits)) return 'visa';
  }
  return 'other';
}

function institution(text:string){
  const normalized=plain(text);
  const choices:Array<[RegExp,string]>=[
    [/\bnu\s*bank\b|\bnubank\b/,'Nubank'],
    [/\bmercado\s*pago\b/,'Mercado Pago'],
    [/\bitau\b/,'Itaú'],
    [/\bsantander\b/,'Santander'],
    [/\bbradesco\b/,'Bradesco'],
    [/\bbanco\s*inter\b|\binter\b/,'Inter'],
    [/\bc6\s*bank\b|\bc6\b/,'C6 Bank'],
    [/\bpicpay\b/,'PicPay'],
    [/\bcaixa\b/,'Caixa'],
    [/\bbanco\s*do\s*brasil\b/,'Banco do Brasil']
  ];
  return choices.find(([pattern])=>pattern.test(normalized))?.[1]||null;
}

function dayNear(text:string,kind:'closing'|'due'){
  const normalized=plain(text);
  const patterns=kind==='closing'
    ? [
        /(?:fecha|fechamento)(?:\s+da\s+fatura)?(?:\s+dia|\s+em)?\s*[:\-]?\s*(\d{1,2})(?:\D|$)/,
        /melhor\s+dia\s+de\s+compra.*?(\d{1,2})(?:\D|$)/
      ]
    : [
        /(?:vence|vencimento)(?:\s+da\s+fatura)?(?:\s+dia|\s+em)?\s*[:\-]?\s*(\d{1,2})(?:\D|$)/,
        /pagar\s+ate\s+(\d{1,2})(?:\D|$)/
      ];
  for(const pattern of patterns){
    const match=normalized.match(pattern);
    const day=validDay(match?.[1]);
    if(day!==null) return day;
  }
  return null;
}

function limitMinor(text:string){
  const normalized=text.normalize('NFKC');
  const patterns=[
    /limite\s+total[^0-9]{0,24}(?:r\$\s*)?([0-9.]+(?:,[0-9]{1,2})?)/i,
    /limite\s+do\s+cart[aã]o[^0-9]{0,24}(?:r\$\s*)?([0-9.]+(?:,[0-9]{1,2})?)/i
  ];
  for(const pattern of patterns){
    const match=normalized.match(pattern);
    if(!match) continue;
    const parsed=parseMoney(match[1]);
    if(parsed!==null) return parsed;
  }
  return null;
}

function last4(text:string){
  const candidates=cardNumberCandidates(text);
  if(candidates.length) return candidates[0].slice(-4);
  const match=text.match(/(?:final|termina(?:do)?\s+em|ultimos?\s*4|\*{2,}|•{2,})[^0-9]{0,12}(\d{4})/i);
  return match?.[1]||null;
}

export function parseLocalCardText(text:string):LocalCardReadResult{
  const institutionName=institution(text);
  return {
    brand:inferCardBrandFromText(text),
    last4:last4(text),
    institutionName,
    cardName:institutionName,
    closingDay:dayNear(text,'closing'),
    dueDay:dayNear(text,'due'),
    totalLimitMinor:limitMinor(text)
  };
}
