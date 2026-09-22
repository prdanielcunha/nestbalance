export type SavingsPotGoalPace={
  remainingMinor:number;
  daysRemaining:number|null;
  suggestedMonthlyMinor:number|null;
  suggestedWeeklyMinor:number|null;
  reached:boolean;
  overdue:boolean;
};

export function savingsPotGoalPace(balanceMinor:number,goalMinor:number|null,targetDate:string|null,now=new Date()):SavingsPotGoalPace{
  const safeBalance=Number.isSafeInteger(balanceMinor)?Math.max(0,balanceMinor):0;
  const safeGoal=Number.isSafeInteger(goalMinor)&&goalMinor!>0?goalMinor:null;
  const remainingMinor=safeGoal?Math.max(0,safeGoal-safeBalance):0;
  const reached=Boolean(safeGoal&&remainingMinor===0);

  if(!safeGoal||!targetDate||!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)){
    return {remainingMinor,daysRemaining:null,suggestedMonthlyMinor:null,suggestedWeeklyMinor:null,reached,overdue:false};
  }

  const [y,m,d]=targetDate.split('-').map(Number);
  const target=Date.UTC(y,m-1,d);
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const daysRemaining=Math.ceil((target-today)/86_400_000);
  const overdue=daysRemaining<0&&!reached;
  if(reached||daysRemaining<=0){
    return {remainingMinor,daysRemaining,suggestedMonthlyMinor:null,suggestedWeeklyMinor:null,reached,overdue};
  }

  const weeks=Math.max(1,Math.ceil(daysRemaining/7));
  const months=Math.max(1,Math.ceil(daysRemaining/30.4375));
  return {
    remainingMinor,
    daysRemaining,
    suggestedMonthlyMinor:Math.ceil(remainingMinor/months),
    suggestedWeeklyMinor:Math.ceil(remainingMinor/weeks),
    reached,
    overdue
  };
}
