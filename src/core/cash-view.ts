export type CashViewTransaction={
  amountMinor:number;
  direction?:'expense'|'income'|'transfer';
  status?:string;
  source?:string|null;
};

export type CashViewCommitment={
  amountMinor:number;
  status?:string;
};

export type CashViewInvoice={
  confirmedAmountMinor:number;
  paidAmountMinor?:number;
  paymentStatus?:string;
  status?:string;
};

export type CashView={
  paidExpenseMinor:number;
  knownCommitmentsMinor:number;
  openCardInvoicesMinor:number;
  futureCommitmentsMinor:number;
};

function positiveMinor(value:unknown){
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>0?n:0;
}

export function deriveCashView(input:{
  transactions:CashViewTransaction[];
  commitments:CashViewCommitment[];
  invoices:CashViewInvoice[];
}):CashView{
  const paidExpenseMinor=input.transactions.reduce((sum,item)=>{
    if(item.status==='cancelled') return sum;
    if(item.direction!=='expense') return sum;
    if(item.source==='credit_card_invoice') return sum;
    return sum+positiveMinor(item.amountMinor);
  },0);

  const knownCommitmentsMinor=input.commitments.reduce((sum,item)=>{
    if(item.status==='paid'||item.status==='cancelled') return sum;
    return sum+positiveMinor(item.amountMinor);
  },0);

  const openCardInvoicesMinor=input.invoices.reduce((sum,item)=>{
    if(item.paymentStatus==='paid'||item.status==='cancelled') return sum;
    const confirmed=positiveMinor(item.confirmedAmountMinor);
    const paid=positiveMinor(item.paidAmountMinor);
    return sum+Math.max(0,confirmed-paid);
  },0);

  return {
    paidExpenseMinor,
    knownCommitmentsMinor,
    openCardInvoicesMinor,
    futureCommitmentsMinor:knownCommitmentsMinor+openCardInvoicesMinor
  };
}
