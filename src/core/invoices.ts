import { installmentInvoiceSchedule, invoiceCycleForPurchase } from './cards.js';

export type InvoicePreviewItemKind='purchase'|'fee';
export type InvoicePreviewConfidence='high'|'medium';

export type InvoicePreviewItem={
  id:string;
  sourceLine:string;
  description:string;
  amountMinor:number;
  purchaseOn:string|null;
  kind:InvoicePreviewItemKind;
  installment:{current:number;total:number}|null;
  confidence:InvoicePreviewConfidence;
  needsReview:string[];
  schedule:Array<{installmentNumber:number;totalInstallments:number;amountMinor:number;dueOn:string}>;
};

export type InvoicePreview={
  parserVersion:'invoice-v0.1'|'invoice-vision-v1';
  invoiceKey:string;
  dueOn:string;
  dueDateSource:'document'|'card_cycle';
  items:InvoicePreviewItem[];
  ignoredLines:number;
  reviewCount:number;
  globalNeedsReview:string[];
  statementTotalMinor:number|null;
  reconciliationDeltaMinor:number|null;
  observedMinor:number;
  futureInstallmentsMinor:number;
};

const moneyPattern=/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)/gi;
const installmentPattern=/\b(?:parc(?:ela)?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i;
const explicitInstallmentPattern=/\bparc(?:ela)?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i;
const genericInstallmentPattern=/\b(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/gi;
const fullDatePattern=/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})\b/;
const shortDatePattern=/\b(\d{2})[\/.\-](\d{2})\b/;

function parseMoney(raw:string){
  const normalized=raw.replace(/^R\$\s*/i,'').replace(/\./g,'').replace(',','.');
  const value=Math.round(Number(normalized)*100);
  return Number.isSafeInteger(value)&&value>0?value:null;
}

function isoDate(year:number,month:number,day:number){
  const date=new Date(year,month-1,day);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day) return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function resolveDate(raw:string,referenceDate:string){
  const full=raw.match(fullDatePattern);
  if(full){
    const day=Number(full[1]),month=Number(full[2]);
    let year=Number(full[3]);
    if(year<100) year+=year>=70?1900:2000;
    return isoDate(year,month,day);
  }
  const short=raw.match(shortDatePattern);
  if(!short) return null;
  const day=Number(short[1]),month=Number(short[2]);
  const ref=new Date(referenceDate+'T12:00:00');
  if(Number.isNaN(ref.getTime())) return null;
  const candidates=[ref.getFullYear()-1,ref.getFullYear(),ref.getFullYear()+1]
    .map(year=>isoDate(year,month,day))
    .filter((value):value is string=>Boolean(value));
  if(!candidates.length) return null;
  return candidates.sort((a,b)=>
    Math.abs(new Date(a+'T12:00:00').getTime()-ref.getTime())-
    Math.abs(new Date(b+'T12:00:00').getTime()-ref.getTime())
  )[0];
}

function findDueDate(text:string,referenceDate:string){
  const labeled=text.match(/(?:vencimento|data\s+de\s+vencimento|vence\s+em)\s*[:\-]?\s*(\d{2}[\/.\-]\d{2}(?:[\/.\-]\d{2,4})?)/i);
  return labeled?resolveDate(labeled[1],referenceDate):null;
}

function lineDate(line:string,referenceDate:string){
  const full=line.match(fullDatePattern);
  if(full) return resolveDate(full[0],referenceDate);
  const short=line.match(shortDatePattern);
  if(short) return resolveDate(short[0],referenceDate);
  return null;
}

function lineMoney(line:string){
  const matches=[...line.matchAll(moneyPattern)];
  if(!matches.length) return null;
  const raw=matches[matches.length-1][0];
  return parseMoney(raw);
}

function cleanDescription(line:string){
  return line
    .replace(fullDatePattern,' ')
    .replace(shortDatePattern,' ')
    .replace(installmentPattern,' ')
    .replace(moneyPattern,' ')
    .replace(/\b(?:compra|lançamento|lancamento)\b\s*[:\-]?/gi,' ')
    .replace(/\s+/g,' ')
    .replace(/^[\-–—:|·]+|[\-–—:|·]+$/g,'')
    .trim()
    .slice(0,120);
}

function isSummaryLine(line:string){
  return /\b(total\s+(?:da\s+)?fatura|saldo\s+anterior|limite\s+(?:total|dispon[ií]vel)|melhor\s+data|fechamento|vencimento)\b/i.test(line);
}

function isPaymentLine(line:string){
  return /\b(pagamento\s+(?:recebido|efetuado|da\s+fatura)|pagto\s+fatura|d[eé]bito\s+autom[aá]tico\s+fatura)\b/i.test(line);
}

function itemKind(line:string):InvoicePreviewItemKind{
  return /\b(juros|iof|multa|anuidade|tarifa|encargos?)\b/i.test(line)?'fee':'purchase';
}

function validInstallmentMatch(current:number,total:number){
  return Number.isInteger(current)&&Number.isInteger(total)&&current>=1&&total>=2&&current<=total&&total<=120;
}

function installmentFromLine(line:string){
  const explicit=line.match(explicitInstallmentPattern);
  if(explicit){
    const current=Number(explicit[1]),total=Number(explicit[2]);
    return validInstallmentMatch(current,total)?{current,total}:null;
  }

  const fullDateRanges=[...line.matchAll(/\b\d{2}[\/.\-]\d{2}[\/.\-]\d{2,4}\b/g)]
    .map(m=>[m.index,m.index+m[0].length] as const);
  const shortDateAtStart=line.match(/^\s*(\d{2}[\/.\-]\d{2})\b/);
  const shortDateRanges=shortDateAtStart&&shortDateAtStart.index!==undefined
    ? [[shortDateAtStart.index+shortDateAtStart[0].indexOf(shortDateAtStart[1]),shortDateAtStart.index+shortDateAtStart[0].indexOf(shortDateAtStart[1])+shortDateAtStart[1].length] as const]
    : [];
  const dateRanges=[...fullDateRanges,...shortDateRanges];

  for(const match of line.matchAll(genericInstallmentPattern)){
    const start=match.index;
    const end=start+match[0].length;
    if(dateRanges.some(([a,b])=>start>=a&&end<=b)) continue;
    const current=Number(match[1]),total=Number(match[2]);
    if(validInstallmentMatch(current,total)) return {current,total};
  }
  return null;
}

export function invoicePreviewItemId(index:number,line:string){
  let hash=2166136261;
  for(const ch of line){
    hash^=ch.charCodeAt(0);
    hash=Math.imul(hash,16777619);
  }
  return `inv-${index}-${(hash>>>0).toString(36)}`;
}

export function parseInvoiceText(input:{
  text:string;
  closingDay:number;
  dueDay:number;
  referenceDate:string;
}):InvoicePreview{
  const text=String(input.text||'').slice(0,100_000);
  if(!text.trim()) throw new Error('EMPTY_INVOICE_TEXT');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate)) throw new Error('INVALID_REFERENCE_DATE');

  const explicitDue=findDueDate(text,input.referenceDate);
  const cycle=invoiceCycleForPurchase(input.referenceDate,input.closingDay,input.dueDay);
  const dueOn=explicitDue||cycle.dueOn;
  const dueDateSource=explicitDue?'document':'card_cycle';
  const invoiceKey=dueOn.slice(0,7);

  let ignoredLines=0;
  const items:InvoicePreviewItem[]=[];

  const lines=text.split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
  for(let index=0;index<lines.length;index++){
    const line=lines[index];
    if(isSummaryLine(line)||isPaymentLine(line)){
      ignoredLines++;
      continue;
    }

    const amountMinor=lineMoney(line);
    if(!amountMinor){
      ignoredLines++;
      continue;
    }

    const description=cleanDescription(line);
    if(description.length<2){
      ignoredLines++;
      continue;
    }

    const purchaseOn=lineDate(line,input.referenceDate);
    const installment=installmentFromLine(line);
    const needsReview:string[]=[];
    if(!purchaseOn) needsReview.push('purchase_date');
    if(installment&&dueDateSource!=='document') needsReview.push('invoice_due_date');

    const schedule=installment
      ? installmentInvoiceSchedule({
          amountMinor,
          current:installment.current,
          total:installment.total,
          firstDueOn:dueOn
        })
      : [];

    items.push({
      id:invoicePreviewItemId(index,line),
      sourceLine:line.slice(0,300),
      description,
      amountMinor,
      purchaseOn,
      kind:itemKind(line),
      installment,
      confidence:needsReview.length?'medium':'high',
      needsReview,
      schedule
    });
  }

  const observedMinor=items.reduce((sum,item)=>sum+item.amountMinor,0);
  const futureInstallmentsMinor=items.reduce((sum,item)=>
    sum+item.schedule.slice(1).reduce((inner,part)=>inner+part.amountMinor,0)
  ,0);

  return {
    parserVersion:'invoice-v0.1',
    invoiceKey,
    dueOn,
    dueDateSource,
    items,
    ignoredLines,
    reviewCount:items.filter(item=>item.needsReview.length>0).length,
    globalNeedsReview:[],
    statementTotalMinor:null,
    reconciliationDeltaMinor:null,
    observedMinor,
    futureInstallmentsMinor
  };
}


function normalizeInvoiceKeyText(value:string){
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,80);
}

export function invoiceItemDedupKey(input:{
  cardId:string;
  invoiceKey:string;
  item:Pick<InvoicePreviewItem,'id'|'description'|'amountMinor'|'purchaseOn'|'installment'>;
}){
  return [
    'invoice_item',
    input.cardId,
    input.invoiceKey,
    input.item.id,
    input.item.purchaseOn||'nodate',
    normalizeInvoiceKeyText(input.item.description),
    input.item.amountMinor,
    input.item.installment?.current??'single',
    input.item.installment?.total??'single'
  ].join('|');
}

export function installmentPlanKey(input:{
  cardId:string;
  item:Pick<InvoicePreviewItem,'description'|'amountMinor'|'purchaseOn'|'installment'>;
}){
  if(!input.item.installment||!input.item.purchaseOn) return null;
  return [
    'installment_plan',
    input.cardId,
    input.item.purchaseOn,
    normalizeInvoiceKeyText(input.item.description),
    input.item.amountMinor,
    input.item.installment.total
  ].join('|');
}
