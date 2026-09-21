export type ProjectionCommitment = {
  amountMinor:number;
  status?:string;
  recurring?:boolean;
  recurrence?:string|null;
  installment?:{current:number;total:number}|null;
  installmentPlanId?:string|null;
};

export type ProjectionInstallmentPlan = {
  id?:string;
  amountMinor:number;
  status?:string;
  totalInstallments:number;
  lastObservedInstallment:number;
  anchorDueOn:string;
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

function validIsoDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(year,month-1,day);
  return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day;
}

function addMonthsClamped(value:string,offset:number){
  if(!validIsoDate(value)) return null;
  const [year,month,day]=value.split('-').map(Number);
  const target=new Date(year,month-1+offset,1);
  const lastDay=new Date(target.getFullYear(),target.getMonth()+1,0).getDate();
  const due=new Date(target.getFullYear(),target.getMonth(),Math.min(day,lastDay));
  return {
    date:due,
    key:`${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,'0')}`
  };
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

export function projectFutureInstallmentPlans(
  plans:ProjectionInstallmentPlan[],
  base:Date,
  months=3
):FutureMonthProjection[]{
  const count=Math.max(1,Math.min(Math.trunc(months)||3,12));
  const result=Array.from({length:count},(_,index)=>({
    ...monthAt(base,index+1),
    totalMinor:0,
    installmentsMinor:0,
    fixedMinor:0,
    itemCount:0
  }));
  const byKey=new Map(result.map(item=>[item.key,item]));

  for(const plan of plans){
    if(plan.status==='completed'||plan.status==='cancelled') continue;
    if(!Number.isSafeInteger(plan.amountMinor)||plan.amountMinor<=0) continue;
    if(!Number.isInteger(plan.totalInstallments)||!Number.isInteger(plan.lastObservedInstallment)) continue;
    if(plan.totalInstallments<1||plan.lastObservedInstallment<1||plan.lastObservedInstallment>=plan.totalInstallments) continue;
    if(!validIsoDate(plan.anchorDueOn)) continue;

    const remaining=plan.totalInstallments-plan.lastObservedInstallment;
    for(let offset=1;offset<=remaining;offset++){
      const due=addMonthsClamped(plan.anchorDueOn,offset);
      if(!due) continue;
      const target=byKey.get(due.key);
      if(!target) continue;
      target.installmentsMinor+=plan.amountMinor;
      target.totalMinor+=plan.amountMinor;
      target.itemCount++;
    }
  }

  return result;
}

export function projectHouseholdFuture(
  commitments:ProjectionCommitment[],
  plans:ProjectionInstallmentPlan[],
  base:Date,
  months=3
):FutureMonthProjection[]{
  const commitmentProjection=projectFutureCommitments(commitments,base,months);
  const planProjection=projectFutureInstallmentPlans(plans,base,months);
  const planIds=new Set(plans.map(plan=>plan.id).filter((id):id is string=>Boolean(id)));

  if(planIds.size===0){
    return commitmentProjection.map((item,index)=>({
      ...item,
      totalMinor:item.totalMinor+planProjection[index].totalMinor,
      installmentsMinor:item.installmentsMinor+planProjection[index].installmentsMinor,
      itemCount:item.itemCount+planProjection[index].itemCount
    }));
  }

  const withoutLinkedCommitments=projectFutureCommitments(
    commitments.filter(item=>!item.installmentPlanId||!planIds.has(item.installmentPlanId)),
    base,
    months
  );

  return withoutLinkedCommitments.map((item,index)=>({
    ...item,
    totalMinor:item.totalMinor+planProjection[index].totalMinor,
    installmentsMinor:item.installmentsMinor+planProjection[index].installmentsMinor,
    itemCount:item.itemCount+planProjection[index].itemCount
  }));
}
