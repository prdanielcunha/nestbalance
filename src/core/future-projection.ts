export type ProjectionCommitment = {
  amountMinor:number;
  status?:string;
  recurring?:boolean;
  recurrence?:string|null;
  installment?:{current:number;total:number}|null;
};

export type FutureMonthProjection = {
  key:string;
  year:number;
  monthIndex:number;
  totalMinor:number;
  installmentsMinor:number;
  fixedMinor:number;
  itemCount:number;
};

function monthAt(base:Date,offset:number){
  const date=new Date(base.getFullYear(),base.getMonth()+offset,1);
  return {year:date.getFullYear(),monthIndex:date.getMonth(),key:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`};
}

function validInstallment(value:ProjectionCommitment['installment']){
  return Boolean(value&&Number.isInteger(value.current)&&Number.isInteger(value.total)&&value.current>=1&&value.total>=value.current);
}

export function projectFutureCommitments(commitments:ProjectionCommitment[],base:Date,months=3):FutureMonthProjection[]{
  const count=Math.max(1,Math.min(Math.trunc(months)||3,12));
  return Array.from({length:count},(_,index)=>{
    const offset=index+1;
    const m=monthAt(base,offset);
    let installmentsMinor=0;
    let fixedMinor=0;
    let itemCount=0;

    for(const item of commitments){
      if(item.status==='paid'||item.status==='cancelled'||!Number.isFinite(item.amountMinor)||item.amountMinor<=0) continue;
      if(validInstallment(item.installment)){
        if(item.installment!.current+offset<=item.installment!.total){
          installmentsMinor+=item.amountMinor;
          itemCount++;
        }
        continue;
      }
      if(item.recurring===true&&item.recurrence==='monthly'){
        fixedMinor+=item.amountMinor;
        itemCount++;
      }
    }

    return {
      ...m,
      totalMinor:installmentsMinor+fixedMinor,
      installmentsMinor,
      fixedMinor,
      itemCount
    };
  });
}
