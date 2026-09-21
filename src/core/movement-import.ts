import { parseFinancialText } from './text-parser';
import type { FinancialInterpretation } from './types';

export type ImportedMovementDirection='expense'|'income'|'transfer'|'unknown';

export type ImportedMovementItem={
  description:string;
  amountMinor:number;
  direction:ImportedMovementDirection;
  dateIso:string|null;
  confidence:number;
  needsReview:boolean;
  visibleText:string;
};

export type ImportedMovementList={
  documentType:'bank_screenshot'|'bank_statement'|'transaction_list'|'other';
  institution:string|null;
  overallConfidence:number;
  ambiguities:string[];
  items:ImportedMovementItem[];
};

function brl(amountMinor:number){
  return (amountMinor/100).toFixed(2).replace('.',',');
}

function validDate(value:string|null){
  return Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value));
}

function sourceText(item:ImportedMovementItem){
  const prefix=item.direction==='income'
    ? 'recebi'
    : item.direction==='transfer'
      ? 'transferi'
      : item.direction==='expense'
        ? 'paguei'
        : '';
  return `${prefix} R$ ${brl(item.amountMinor)} ${item.description}`.trim();
}

export function buildImportedMovements(input:ImportedMovementList):FinancialInterpretation[]{
  return input.items
    .filter(item=>Number.isSafeInteger(item.amountMinor)&&item.amountMinor>0&&item.description.trim().length>1)
    .map(item=>{
      const parsed=parseFinancialText(sourceText(item));
      const needsReview=[
        ...parsed.needsReview,
        ...(item.direction==='unknown'?['direction']:[]),
        ...(item.needsReview||item.confidence<0.86?['import_review']:[])
      ];
      return {
        ...parsed,
        occurredOn:validDate(item.dateIso)?item.dateIso!:undefined,
        confidence:needsReview.length
          ? (item.confidence>=0.65?'medium':'low')
          : 'high',
        needsReview:[...new Set(needsReview)],
        fieldConfidence:{
          ...parsed.fieldConfidence,
          amount:Math.max(parsed.fieldConfidence.amount??0,item.confidence),
          description:Math.min(0.98,Math.max(parsed.fieldConfidence.description??0,item.confidence)),
          direction:item.direction==='unknown'?0:Math.min(0.98,item.confidence)
        },
        sourceText:sourceText(item)
      };
    });
}

export function resolveImportedMovementDirection(
  interpretation:FinancialInterpretation,
  direction:Exclude<ImportedMovementDirection,'unknown'>
):FinancialInterpretation{
  const description=interpretation.description;
  const prefix=direction==='income'?'recebi':direction==='transfer'?'transferi':'paguei';
  const parsed=parseFinancialText(`${prefix} R$ ${brl(interpretation.money.amountMinor)} ${description}`);
  return {
    ...parsed,
    occurredOn:interpretation.occurredOn,
    confidence:interpretation.needsReview.some(item=>item!=='direction')?'medium':'high',
    needsReview:interpretation.needsReview.filter(item=>item!=='direction'),
    fieldConfidence:{...interpretation.fieldConfidence,direction:0.99}
  };
}
