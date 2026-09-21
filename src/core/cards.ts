export const CARD_BRANDS = ['visa','mastercard','elo','amex','other'] as const;
export type CardBrand = typeof CARD_BRANDS[number];

export type CreditCardDraft = {
  name:string;
  brand:CardBrand;
  closingDay:number;
  dueDay:number;
  last4:string|null;
  limitMinor:number|null;
  currency:'BRL';
};

export type CreditCardValidation =
  | {ok:true;value:CreditCardDraft;dedupKey:string}
  | {ok:false;reason:'INVALID_NAME'|'INVALID_BRAND'|'INVALID_CLOSING_DAY'|'INVALID_DUE_DAY'|'INVALID_LAST4'|'INVALID_LIMIT'};

function normalizeName(value:string){
  return value.normalize('NFKC').replace(/\s+/g,' ').trim();
}

function dayOfMonth(value:unknown):number|null{
  const n=Number(value);
  return Number.isInteger(n)&&n>=1&&n<=31?n:null;
}

export function creditCardDedupKey(name:string,last4:string|null){
  const normalized=normalizeName(name).toLocaleLowerCase('pt-BR');
  return last4 ? `${normalized}|${last4}` : normalized;
}

export function validateCreditCardDraft(input:{
  name:unknown;
  brand:unknown;
  closingDay:unknown;
  dueDay:unknown;
  last4?:unknown;
  limitMinor?:unknown;
}):CreditCardValidation{
  const name=normalizeName(typeof input.name==='string'?input.name:'');
  if(name.length<2||name.length>60) return {ok:false,reason:'INVALID_NAME'};

  if(!CARD_BRANDS.includes(input.brand as CardBrand)) return {ok:false,reason:'INVALID_BRAND'};
  const brand=input.brand as CardBrand;

  const closingDay=dayOfMonth(input.closingDay);
  if(closingDay===null) return {ok:false,reason:'INVALID_CLOSING_DAY'};

  const dueDay=dayOfMonth(input.dueDay);
  if(dueDay===null) return {ok:false,reason:'INVALID_DUE_DAY'};

  const last4Raw=typeof input.last4==='string'?input.last4.trim():'';
  const last4=last4Raw?last4Raw:null;
  if(last4!==null&&!/^\d{4}$/.test(last4)) return {ok:false,reason:'INVALID_LAST4'};

  let limitMinor:number|null=null;
  if(input.limitMinor!==undefined&&input.limitMinor!==null&&input.limitMinor!==''){
    const n=Number(input.limitMinor);
    if(!Number.isSafeInteger(n)||n<0||n>1_000_000_000_000) return {ok:false,reason:'INVALID_LIMIT'};
    limitMinor=n;
  }

  return {
    ok:true,
    value:{name,brand,closingDay,dueDay,last4,limitMinor,currency:'BRL'},
    dedupKey:creditCardDedupKey(name,last4)
  };
}

function clampDay(year:number,monthIndex:number,day:number){
  const last=new Date(year,monthIndex+1,0).getDate();
  return Math.min(day,last);
}

function localDate(year:number,monthIndex:number,day:number){
  return new Date(year,monthIndex,clampDay(year,monthIndex,day));
}

export function invoiceCycleForPurchase(observedOn:string,closingDay:number,dueDay:number){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)) throw new Error('INVALID_PURCHASE_DATE');
  const [year,month,day]=observedOn.split('-').map(Number);
  if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)) throw new Error('INVALID_PURCHASE_DATE');
  const parsed=new Date(year,month-1,day);
  if(parsed.getFullYear()!==year||parsed.getMonth()!==month-1||parsed.getDate()!==day) throw new Error('INVALID_PURCHASE_DATE');
  if(dayOfMonth(closingDay)===null) throw new Error('INVALID_CLOSING_DAY');
  if(dayOfMonth(dueDay)===null) throw new Error('INVALID_DUE_DAY');

  const closeMonthOffset=day>closingDay?1:0;
  const closeDate=localDate(year,month-1+closeMonthOffset,closingDay);

  const dueMonthOffset=dueDay>closingDay?0:1;
  const dueDate=localDate(closeDate.getFullYear(),closeDate.getMonth()+dueMonthOffset,dueDay);

  const iso=(d:Date)=>[
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')
  ].join('-');

  return {
    closingOn:iso(closeDate),
    dueOn:iso(dueDate),
    invoiceKey:`${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}`
  };
}

export function installmentInvoiceSchedule(input:{
  amountMinor:number;
  current:number;
  total:number;
  firstDueOn:string;
}){
  const amountMinor=Number(input.amountMinor);
  const current=Number(input.current);
  const total=Number(input.total);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0) throw new Error('INVALID_INSTALLMENT_AMOUNT');
  if(!Number.isInteger(current)||!Number.isInteger(total)||current<1||total<current||total>120) throw new Error('INVALID_INSTALLMENT_PLAN');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.firstDueOn)) throw new Error('INVALID_DUE_DATE');

  const [year,month,day]=input.firstDueOn.split('-').map(Number);
  const base=new Date(year,month-1,day);
  if(base.getFullYear()!==year||base.getMonth()!==month-1||base.getDate()!==day) throw new Error('INVALID_DUE_DATE');

  const remaining=total-current+1;
  return Array.from({length:remaining},(_,offset)=>{
    const date=localDate(base.getFullYear(),base.getMonth()+offset,day);
    return {
      installmentNumber:current+offset,
      totalInstallments:total,
      amountMinor,
      dueOn:[
        date.getFullYear(),
        String(date.getMonth()+1).padStart(2,'0'),
        String(date.getDate()).padStart(2,'0')
      ].join('-')
    };
  });
}
