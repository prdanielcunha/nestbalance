import type { DocumentSignalsResult } from './document-signals.js';

export type DocumentCaptureSuggestion =
  | { state:'suggested'; sourceText:string; amountMinor:number; installment?:{current:number;total:number}; needsReview:true }
  | { state:'choose_amount'; amountsMinor:number[] }
  | { state:'no_amount' };

function baseName(name:string) {
  const withoutExtension=name.replace(/\.[^.]+$/,'');
  const normalized=withoutExtension.replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  return normalized || 'Documento';
}

function brlInput(amountMinor:number) {
  return (amountMinor/100).toFixed(2).replace('.',',');
}

export function suggestCaptureFromDocument(fileName:string,signals:DocumentSignalsResult):DocumentCaptureSuggestion {
  const money=signals.candidates.filter(x=>x.kind==='money'&&Number.isSafeInteger(x.amountMinor));
  if (money.length===0) return {state:'no_amount'};
  if (money.length>1) {
    const distinct=[...new Set(money.map(x=>x.amountMinor!))];
    return {state:'choose_amount',amountsMinor:distinct};
  }

  const amountMinor=money[0].amountMinor!;
  const installments=signals.candidates.filter(x=>x.kind==='installment'&&x.installmentCurrent&&x.installmentTotal);
  const installment=installments.length===1
    ? {current:installments[0].installmentCurrent!,total:installments[0].installmentTotal!}
    : undefined;
  const installmentText=installment?` ${installment.current}/${installment.total}`:'';
  return {
    state:'suggested',
    sourceText:`${baseName(fileName)} R$ ${brlInput(amountMinor)}${installmentText}`,
    amountMinor,
    installment,
    needsReview:true
  };
}

export function sourceTextForChosenDocumentAmount(fileName:string,amountMinor:number,signals:DocumentSignalsResult) {
  const installments=signals.candidates.filter(x=>x.kind==='installment'&&x.installmentCurrent&&x.installmentTotal);
  const installment=installments.length===1?` ${installments[0].installmentCurrent}/${installments[0].installmentTotal}`:'';
  return `${baseName(fileName)} R$ ${brlInput(amountMinor)}${installment}`;
}
