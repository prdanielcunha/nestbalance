export type AiFinancialDirection='expense'|'income'|'transfer'|'unknown';

export type AiFinancialAccountSnapshot={
  name:string;
  productType:'account'|'wallet'|'savings'|'investment';
  balanceMinor:number;
  currency:'BRL'|'USD'|'EUR';
  confidence:number;
  last4:string|null;
};

export type AiFinancialPotSnapshot={
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  targetDate:string|null;
  currency:'BRL'|'USD'|'EUR';
  confidence:number;
};

export type AiFinancialCardSnapshot={
  name:string;
  last4:string|null;
  statementAmountMinor:number|null;
  dueOn:string|null;
  availableLimitMinor:number|null;
  totalLimitMinor:number|null;
  confidence:number;
};

export type AiFinancialCommitmentSnapshot={
  description:string;
  amountMinor:number;
  dueOn:string|null;
  installment:{current:number;total:number}|null;
  confidence:number;
  needsReview:boolean;
};

export type AiFinancialMovementSnapshot={
  description:string;
  amountMinor:number;
  direction:AiFinancialDirection;
  dateIso:string|null;
  confidence:number;
  needsReview:boolean;
  visibleText:string;
};

export type AiFinancialScreenSnapshot={
  screenType:'single_event'|'account_home'|'transaction_list'|'card_home'|'card_statement'|'retail_account'|'savings_pots'|'mixed'|'other';
  institution:string|null;
  accounts:AiFinancialAccountSnapshot[];
  pots:AiFinancialPotSnapshot[];
  cards:AiFinancialCardSnapshot[];
  commitments:AiFinancialCommitmentSnapshot[];
  movements:AiFinancialMovementSnapshot[];
  summary:string;
};

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
  screen?:AiFinancialScreenSnapshot|null;
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
