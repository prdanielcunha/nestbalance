import { installmentInvoiceSchedule } from './cards.js';
import type { InvoicePreview, InvoicePreviewItem, InvoicePreviewItemKind } from './invoices.js';

export type InvoiceReviewItemDraft={
  description:string;
  amountMinor:number;
  purchaseOn:string|null;
  kind:InvoicePreviewItemKind;
  installment:{current:number;total:number}|null;
};

export type InvoiceReviewValidation=
  | {ok:true;value:InvoiceReviewItemDraft}
  | {ok:false;reason:'INVALID_DESCRIPTION'|'INVALID_AMOUNT'|'INVALID_DATE'|'INVALID_KIND'|'INVALID_INSTALLMENT'};

function validIsoDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  const parsed=new Date(year,month-1,day);
  return parsed.getFullYear()===year&&parsed.getMonth()===month-1&&parsed.getDate()===day;
}

export function validateInvoiceReviewItem(input:any):InvoiceReviewValidation{
  const description=typeof input?.description==='string'
    ? input.description.normalize('NFKC').replace(/\s+/g,' ').trim()
    : '';
  if(description.length<2||description.length>120) return {ok:false,reason:'INVALID_DESCRIPTION'};

  const amountMinor=Number(input?.amountMinor);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>1_000_000_000_000){
    return {ok:false,reason:'INVALID_AMOUNT'};
  }

  const purchaseOn=input?.purchaseOn===null||input?.purchaseOn===''?null:String(input?.purchaseOn||'');
  if(purchaseOn!==null&&!validIsoDate(purchaseOn)) return {ok:false,reason:'INVALID_DATE'};

  const kind=input?.kind;
  if(kind!=='purchase'&&kind!=='fee') return {ok:false,reason:'INVALID_KIND'};

  let installment:null|{current:number;total:number}=null;
  if(input?.installment!==null&&input?.installment!==undefined){
    const current=Number(input.installment.current);
    const total=Number(input.installment.total);
    if(
      !Number.isInteger(current)||!Number.isInteger(total)||
      current<1||total<2||current>total||total>120
    ) return {ok:false,reason:'INVALID_INSTALLMENT'};
    installment={current,total};
  }

  return {ok:true,value:{description,amountMinor,purchaseOn,kind,installment}};
}

function itemNeedsReview(item:InvoiceReviewItemDraft,dueDateSource:InvoicePreview['dueDateSource']){
  const needs:string[]=[];
  if(!item.purchaseOn) needs.push('purchase_date');
  if(item.installment&&dueDateSource!=='document') needs.push('invoice_due_date');
  return needs;
}

function rebuildItem(input:{
  id:string;
  sourceLine:string;
  draft:InvoiceReviewItemDraft;
  dueOn:string;
  dueDateSource:InvoicePreview['dueDateSource'];
}):InvoicePreviewItem{
  const needsReview=itemNeedsReview(input.draft,input.dueDateSource);
  const schedule=input.draft.installment
    ? installmentInvoiceSchedule({
        amountMinor:input.draft.amountMinor,
        current:input.draft.installment.current,
        total:input.draft.installment.total,
        firstDueOn:input.dueOn
      })
    : [];

  return {
    id:input.id,
    sourceLine:input.sourceLine.slice(0,300),
    description:input.draft.description,
    amountMinor:input.draft.amountMinor,
    purchaseOn:input.draft.purchaseOn,
    kind:input.draft.kind,
    installment:input.draft.installment,
    confidence:needsReview.length?'medium':'high',
    needsReview,
    schedule
  };
}

function recomputePreview(
  base:InvoicePreview,
  items:InvoicePreviewItem[],
  options?:{acknowledgeVisual?:boolean;humanReviewed?:boolean}
):InvoicePreview{
  const observedMinor=items.reduce((sum,item)=>sum+item.amountMinor,0);
  const futureInstallmentsMinor=items.reduce((sum,item)=>
    sum+item.schedule.slice(1).reduce((inner,part)=>inner+part.amountMinor,0)
  ,0);

  const preserved=base.globalNeedsReview.filter(reason=>
    !['statement_total_mismatch','no_invoice_items','visual_invoice'].includes(reason)
  );
  const globalNeedsReview=[...preserved];

  if(items.length===0) globalNeedsReview.push('no_invoice_items');
  if(
    base.globalNeedsReview.includes('visual_invoice')&&
    !options?.acknowledgeVisual
  ) globalNeedsReview.push('visual_invoice');

  const reconciliationDeltaMinor=base.statementTotalMinor===null
    ? null
    : base.statementTotalMinor-observedMinor;
  if(reconciliationDeltaMinor!==null&&reconciliationDeltaMinor!==0){
    globalNeedsReview.push('statement_total_mismatch');
  }

  const uniqueGlobal=[...new Set(globalNeedsReview)];
  return {
    ...base,
    items,
    observedMinor,
    futureInstallmentsMinor,
    reconciliationDeltaMinor,
    globalNeedsReview:uniqueGlobal,
    reviewCount:items.filter(item=>item.needsReview.length>0).length+uniqueGlobal.length,
    reviewVersion:'human-review-v1',
    humanReviewed:Boolean(options?.humanReviewed||base.humanReviewed)
  };
}

export function updateInvoiceReviewItem(input:{
  preview:InvoicePreview;
  itemId:string;
  draft:InvoiceReviewItemDraft;
}){
  const index=input.preview.items.findIndex(item=>item.id===input.itemId);
  if(index<0) throw new Error('INVOICE_ITEM_NOT_FOUND');
  const current=input.preview.items[index];
  const next=rebuildItem({
    id:current.id,
    sourceLine:current.sourceLine,
    draft:input.draft,
    dueOn:input.preview.dueOn,
    dueDateSource:input.preview.dueDateSource
  });
  const items=input.preview.items.slice();
  items[index]=next;
  return recomputePreview(input.preview,items,{humanReviewed:true});
}

export function addInvoiceReviewItem(input:{
  preview:InvoicePreview;
  itemId:string;
  draft:InvoiceReviewItemDraft;
}){
  if(input.preview.items.some(item=>item.id===input.itemId)) throw new Error('INVOICE_ITEM_ALREADY_EXISTS');
  const next=rebuildItem({
    id:input.itemId,
    sourceLine:`Adicionado manualmente: ${input.draft.description}`,
    draft:input.draft,
    dueOn:input.preview.dueOn,
    dueDateSource:input.preview.dueDateSource
  });
  return recomputePreview(input.preview,[...input.preview.items,next],{humanReviewed:true});
}

export function removeInvoiceReviewItem(input:{preview:InvoicePreview;itemId:string}){
  if(!input.preview.items.some(item=>item.id===input.itemId)) throw new Error('INVOICE_ITEM_NOT_FOUND');
  return recomputePreview(
    input.preview,
    input.preview.items.filter(item=>item.id!==input.itemId),
    {humanReviewed:true}
  );
}

export function acknowledgeInvoiceVisualReview(preview:InvoicePreview){
  return recomputePreview(preview,preview.items,{acknowledgeVisual:true,humanReviewed:true});
}
