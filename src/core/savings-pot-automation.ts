export type SavingsPotAutomationKind='frequency'|'spend'|'income'|'roundup';
export type SavingsPotFrequency='weekly'|'biweekly'|'monthly';
export type SavingsPotAutomationMode='fixed'|'percent';

export type SavingsPotAutomation={
  enabled:boolean;
  kind:SavingsPotAutomationKind;
  mode:SavingsPotAutomationMode;
  amountMinor:number|null;
  percentBps:number|null;
  frequency:SavingsPotFrequency|null;
  anchorDate:string|null;
};

export function normalizeSavingsPotAutomation(value:unknown):SavingsPotAutomation|null{
  if(!value||typeof value!=='object') return null;
  const raw=value as Record<string,unknown>;
  const enabled=raw.enabled===true;
  const kind=['frequency','spend','income','roundup'].includes(String(raw.kind))?String(raw.kind) as SavingsPotAutomationKind:null;
  const mode=['fixed','percent'].includes(String(raw.mode))?String(raw.mode) as SavingsPotAutomationMode:'fixed';
  if(!kind) return null;

  const amount=Number(raw.amountMinor);
  const amountMinor=Number.isSafeInteger(amount)&&amount>0&&amount<=1_000_000_000_000?amount:null;
  const percent=Number(raw.percentBps);
  const percentBps=Number.isInteger(percent)&&percent>=1&&percent<=10_000?percent:null;
  const frequency=['weekly','biweekly','monthly'].includes(String(raw.frequency))?String(raw.frequency) as SavingsPotFrequency:null;
  const anchorDate=/^\d{4}-\d{2}-\d{2}$/.test(String(raw.anchorDate||''))?String(raw.anchorDate):null;

  if(kind==='frequency'&&(!frequency||!amountMinor)) return null;
  if(kind==='roundup') return {enabled,kind,mode:'fixed',amountMinor:null,percentBps:null,frequency:null,anchorDate};
  if(kind!=='frequency'&&mode==='fixed'&&!amountMinor) return null;
  if(kind!=='frequency'&&mode==='percent'&&!percentBps) return null;

  return {enabled,kind,mode,amountMinor,percentBps,frequency,anchorDate};
}

function utcDate(value:string){
  const [year,month,day]=value.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,day));
}
function key(date:Date){ return date.toISOString().slice(0,10); }

export function frequencyOccurrenceDates(automation:SavingsPotAutomation,throughDate:string,limit=12){
  if(!automation.enabled||automation.kind!=='frequency'||!automation.frequency||!automation.anchorDate) return [];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(throughDate)) return [];
  const through=utcDate(throughDate);
  let current=utcDate(automation.anchorDate);
  const out:string[]=[];
  let guard=0;
  while(current<=through&&guard<5000){
    out.push(key(current));
    if(out.length>limit) out.shift();
    if(automation.frequency==='weekly') current.setUTCDate(current.getUTCDate()+7);
    else if(automation.frequency==='biweekly') current.setUTCDate(current.getUTCDate()+15);
    else current.setUTCMonth(current.getUTCMonth()+1);
    guard++;
  }
  return out;
}

export function automationContributionMinor(automation:SavingsPotAutomation,movementAmountMinor:number){
  if(!automation.enabled) return 0;
  if(automation.kind==='roundup'){
    const remainder=movementAmountMinor%100;
    return remainder===0?0:100-remainder;
  }
  if(automation.mode==='percent'){
    if(!automation.percentBps) return 0;
    return Math.max(1,Math.round(movementAmountMinor*automation.percentBps/10_000));
  }
  return automation.amountMinor||0;
}
