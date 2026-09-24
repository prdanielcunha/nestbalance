import type { FinancialInterpretation } from './types.js';

export type ReviewedInterpretationInput={
  kind:'transaction'|'commitment';
  description:string;
  amountMinor:number;
  direction:'expense'|'income'|'transfer';
  dueDay?:number|null;
  recurring?:boolean;
  recurrence?:'monthly'|null;
  installment?:{current:number;total:number}|null;
};

export function applyReviewedInterpretation(
  base:FinancialInterpretation,
  raw:unknown
):{ok:true;value:FinancialInterpretation}|{ok:false;reason:string}{
  if(!raw||typeof raw!=='object') return {ok:true,value:base};
  const input=raw as Record<string,unknown>;
  const description=String(input.description||'').trim().replace(/\s+/g,' ');
  const amountMinor=Number(input.amountMinor);
  const direction=input.direction;
  if(input.kind!==base.kind) return {ok:false,reason:'REVIEW_KIND_MISMATCH'};
  if(description.length<2||description.length>160) return {ok:false,reason:'INVALID_REVIEW_DESCRIPTION'};
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>1_000_000_000_000) return {ok:false,reason:'INVALID_REVIEW_AMOUNT'};
  if(direction!=='expense'&&direction!=='income'&&direction!=='transfer') return {ok:false,reason:'INVALID_REVIEW_DIRECTION'};

  const dueDay=input.dueDay==null?undefined:Number(input.dueDay);
  if(dueDay!==undefined&&(!Number.isInteger(dueDay)||dueDay<1||dueDay>31)) return {ok:false,reason:'INVALID_REVIEW_DUE_DAY'};

  let installment:FinancialInterpretation['installment']=undefined;
  if(input.installment&&typeof input.installment==='object'){
    const candidate=input.installment as Record<string,unknown>;
    const current=Number(candidate.current);
    const total=Number(candidate.total);
    if(!Number.isInteger(current)||!Number.isInteger(total)||current<1||total<current||total>600){
      return {ok:false,reason:'INVALID_REVIEW_INSTALLMENT'};
    }
    installment={current,total};
  }

  const recurring=input.recurring===true;
  return {
    ok:true,
    value:{
      ...base,
      description,
      money:{...base.money,amountMinor},
      direction,
      dueDay,
      recurring,
      recurrence:recurring?'monthly':undefined,
      installment,
      confidence:'high',
      needsReview:[],
      fieldConfidence:{
        ...base.fieldConfidence,
        description:1,
        amount:1,
        direction:1,
        dueDay:dueDay===undefined?(base.fieldConfidence.dueDay??0):1
      }
    }
  };
}

export function reviewedInterpretationPayload(value:FinancialInterpretation):ReviewedInterpretationInput{
  return {
    kind:value.kind,
    description:value.description,
    amountMinor:value.money.amountMinor,
    direction:value.direction,
    dueDay:value.dueDay??null,
    recurring:value.recurring,
    recurrence:value.recurrence??null,
    installment:value.installment??null
  };
}
