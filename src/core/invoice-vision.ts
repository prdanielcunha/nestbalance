import { installmentInvoiceSchedule, invoiceCycleForPurchase } from './cards.js';
import { invoicePreviewItemId, type InvoicePreview, type InvoicePreviewItem, type InvoicePreviewItemKind } from './invoices.js';

export type InvoiceVisionItemInput={
  description:string;
  amountMinor:number;
  purchaseOn:string|null;
  installment:{current:number;total:number}|null;
  kind:InvoicePreviewItemKind;
  confidence:number;
  needsReview:boolean;
  visibleText:string;
};

export type InvoiceVisionInput={
  dueOn:string|null;
  statementTotalMinor:number|null;
  overallConfidence:number;
  ambiguities:string[];
  items:InvoiceVisionItemInput[];
};

function validIsoDate(value:string|null):value is string{
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  const parsed=new Date(year,month-1,day);
  return parsed.getFullYear()===year&&parsed.getMonth()===month-1&&parsed.getDate()===day;
}

function validInstallment(value:InvoiceVisionItemInput['installment']){
  return Boolean(
    value&&Number.isInteger(value.current)&&Number.isInteger(value.total)&&
    value.current>=1&&value.total>=value.current&&value.total<=120
  );
}

export function buildInvoiceVisionPreview(input:{
  extraction:InvoiceVisionInput;
  closingDay:number;
  dueDay:number;
  referenceDate:string;
}):InvoicePreview{
  const cycle=invoiceCycleForPurchase(input.referenceDate,input.closingDay,input.dueDay);
  const explicitDue=validIsoDate(input.extraction.dueOn)?input.extraction.dueOn:null;
  const dueOn=explicitDue||cycle.dueOn;
  const dueDateSource=explicitDue?'document':'card_cycle';
  const invoiceKey=dueOn.slice(0,7);

  const items:InvoicePreviewItem[]=[];
  for(let index=0;index<input.extraction.items.length;index++){
    const source=input.extraction.items[index];
    const description=String(source.description||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,120);
    const amountMinor=Number(source.amountMinor);
    if(description.length<2||!Number.isSafeInteger(amountMinor)||amountMinor<=0) continue;

    const purchaseOn=validIsoDate(source.purchaseOn)?source.purchaseOn:null;
    const installment=validInstallment(source.installment)?source.installment:null;
    const needsReview:string[]=[];
    if(!purchaseOn) needsReview.push('purchase_date');
    if(source.needsReview||!Number.isFinite(source.confidence)||source.confidence<0.88) needsReview.push('visual_item');
    if(installment&&dueDateSource!=='document') needsReview.push('invoice_due_date');

    const sourceLine=String(source.visibleText||description).normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,300);
    const schedule=installment
      ? installmentInvoiceSchedule({
          amountMinor,
          current:installment.current,
          total:installment.total,
          firstDueOn:dueOn
        })
      : [];

    items.push({
      id:invoicePreviewItemId(index,sourceLine||description),
      sourceLine:sourceLine||description,
      description,
      amountMinor,
      purchaseOn,
      kind:source.kind==='fee'?'fee':'purchase',
      installment,
      confidence:needsReview.length?'medium':'high',
      needsReview:[...new Set(needsReview)],
      schedule
    });
  }

  const observedMinor=items.reduce((sum,item)=>sum+item.amountMinor,0);
  const statementTotalMinor=Number.isSafeInteger(input.extraction.statementTotalMinor)&&Number(input.extraction.statementTotalMinor)>0
    ? Number(input.extraction.statementTotalMinor)
    : null;
  const reconciliationDeltaMinor=statementTotalMinor===null?null:statementTotalMinor-observedMinor;

  const globalNeedsReview:string[]=[];
  if(items.length===0) globalNeedsReview.push('no_invoice_items');
  if(
    input.extraction.overallConfidence<0.88||
    input.extraction.ambiguities.length>0
  ) globalNeedsReview.push('visual_invoice');
  if(reconciliationDeltaMinor!==null&&reconciliationDeltaMinor!==0){
    globalNeedsReview.push('statement_total_mismatch');
  }

  const futureInstallmentsMinor=items.reduce((sum,item)=>
    sum+item.schedule.slice(1).reduce((inner,part)=>inner+part.amountMinor,0)
  ,0);

  return {
    parserVersion:'invoice-vision-v1',
    invoiceKey,
    dueOn,
    dueDateSource,
    items,
    ignoredLines:0,
    reviewCount:items.filter(item=>item.needsReview.length>0).length+globalNeedsReview.length,
    globalNeedsReview:[...new Set(globalNeedsReview)],
    statementTotalMinor,
    reconciliationDeltaMinor,
    observedMinor,
    futureInstallmentsMinor
  };
}
