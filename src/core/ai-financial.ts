export type AiFinancialDirection='expense'|'income'|'transfer'|'unknown';

export type AiFinancialExtraction={
  documentType:'pix_receipt'|'bill'|'receipt'|'invoice'|'bank_screenshot'|'card_statement'|'other';
  description:string|null;
  descriptionConfidence:number;
  amountMinor:number|null;
  amountConfidence:number;
  amountCandidatesMinor:number[];
  direction:AiFinancialDirection;
  directionConfidence:number;
  dateIso:string|null;
  time:string|null;
  merchant:string|null;
  payer:string|null;
  payee:string|null;
  institution:string|null;
  paymentMethod:'pix'|'card'|'cash'|'boleto'|'transfer'|'other'|null;
  transactionId:string|null;
  pixE2e:string|null;
  installment:{current:number;total:number}|null;
  recurringLikely:boolean|null;
  subscriptionLikely:boolean|null;
  overallConfidence:number;
  needsConfirmation:boolean;
  ambiguities:string[];
  evidenceSummary:string;
};

function validAmount(value:number|null):value is number{
  return Number.isSafeInteger(value)&&value!>0&&value!<=1_000_000_000_000;
}

function validInstallment(value:AiFinancialExtraction['installment']){
  return Boolean(value&&Number.isInteger(value.current)&&Number.isInteger(value.total)&&value.current>=1&&value.total>=value.current&&value.total<=120);
}

function brlInput(amountMinor:number){
  return (amountMinor/100).toFixed(2).replace('.',',');
}

function safeDescription(value:string|null,fallbacks:(string|null)[]){
  const raw=[value,...fallbacks].find(v=>typeof v==='string'&&v.trim().length>1);
  return raw?.trim().replace(/\s+/g,' ').slice(0,120)||'Movimento';
}

export function aiAmountChoices(extraction:AiFinancialExtraction):number[]{
  const candidates=[
    ...(validAmount(extraction.amountMinor)?[extraction.amountMinor]:[]),
    ...extraction.amountCandidatesMinor.filter(validAmount)
  ];
  return [...new Set(candidates)].slice(0,5);
}

export function aiDirectionNeedsConfirmation(extraction:AiFinancialExtraction){
  return extraction.direction==='unknown'||extraction.directionConfidence<0.82;
}

export function sourceTextFromAiExtraction(
  extraction:AiFinancialExtraction,
  options?:{amountMinor?:number;direction?:Exclude<AiFinancialDirection,'unknown'>}
):string|null{
  const amountMinor=options?.amountMinor??extraction.amountMinor;
  if(!validAmount(amountMinor)) return null;
  const direction=options?.direction??(extraction.direction==='unknown'?null:extraction.direction);
  if(!direction) return null;

  const prefix=direction==='income'?'recebi':direction==='transfer'?'transferi':'paguei';
  const description=safeDescription(extraction.description,[extraction.merchant,extraction.payee,extraction.institution]);
  const installment=validInstallment(extraction.installment)?` ${extraction.installment!.current}/${extraction.installment!.total}`:'';
  return `${prefix} R$ ${brlInput(amountMinor)} ${description}${installment}`;
}

export function aiExtractionNeedsReview(extraction:AiFinancialExtraction){
  return extraction.needsConfirmation||
    extraction.overallConfidence<0.9||
    extraction.amountConfidence<0.9||
    extraction.descriptionConfidence<0.8||
    aiDirectionNeedsConfirmation(extraction);
}
