export type BalanceCoverage='excludes_pots'|'includes_pots'|'unknown';
export type BalanceAccount={id:string;balanceMinor:number|null;currency:string;status:string;connectedProductType?:string|null;balanceCoverage?:BalanceCoverage;includedSavingsMinor?:number|null;balanceAsOfMs?:number|null;observedOn?:string|null};
export type BalancePot={id:string;balanceMinor:number;currency:string;status:string;updatedAtMs?:number|null;observedOn?:string|null};

function observationTime(source:{observedOn?:string|null;balanceAsOfMs?:number|null;updatedAtMs?:number|null}){
  const observed=source.observedOn?Date.parse(source.observedOn+'T12:00:00Z'):NaN;
  return Number.isFinite(observed)?observed:source.balanceAsOfMs??source.updatedAtMs??null;
}

// Coverage is explicitly confirmed per account. Never infer that all pots at a
// bank belong to a particular account, or subtract a partial screenshot total.
export function deriveBalanceComposition<A extends BalanceAccount,P extends BalancePot>(accounts:A[],pots:P[],currency='BRL',now=Date.now()){
  const rows=accounts.filter(a=>a.status==='active'&&a.currency===currency&&a.connectedProductType!=='investment').map(account=>{
    const known=Number.isSafeInteger(account.balanceMinor);
    const coverage=account.balanceCoverage||'unknown';
    const included=account.includedSavingsMinor;
    const resolved=known&&(coverage==='excludes_pots'||(coverage==='includes_pots'&&Number.isSafeInteger(included)&&included!>=0&&included!<=account.balanceMinor!));
    return {account,amountMinor:resolved?account.balanceMinor!-(coverage==='includes_pots'?included!:0):null,stale:!observationTime(account)||now-observationTime(account)!>7*86_400_000};
  });
  const sources=pots.filter(p=>p.status==='active'&&p.currency===currency);
  const savedMinor=sources.reduce((s,p)=>s+(Number.isSafeInteger(p.balanceMinor)?p.balanceMinor:0),0);
  const complete=rows.length>0&&rows.every(r=>r.amountMinor!==null);
  const knownRows=rows.filter(r=>Number.isSafeInteger(r.account.balanceMinor));
  const reportedMinor=knownRows.length?knownRows.reduce((sum,r)=>sum+r.account.balanceMinor!,0):null;
  const provisionalOutsideMinor=knownRows.length?knownRows.reduce((sum,r)=>sum+(r.amountMinor??r.account.balanceMinor!),0):null;
  const pendingCount=rows.filter(r=>r.amountMinor===null).length;
  return {rows,sources,savedMinor,reportedMinor,provisionalOutsideMinor,pendingCount,outsideMinor:complete?rows.reduce((s,r)=>s+r.amountMinor!,0):null,complete,stale:rows.some(r=>r.stale)||sources.some(p=>!observationTime(p)||now-observationTime(p)!>7*86_400_000),otherCurrencies:[...new Set([...accounts,...pots].filter(x=>x.status==='active'&&x.currency!==currency).map(x=>x.currency))]};
}

// Unresolved coverage may contain savings: expose an explicit provisional
// ceiling, never silently treat the reported bank balance as spendable money.
export function deriveSpendingAvailability(input:{outsideMinor:number|null;provisionalOutsideMinor:number|null;complete:boolean},commitmentsMinor:number){
  const base=input.complete?input.outsideMinor:input.provisionalOutsideMinor;
  const pending=Number.isSafeInteger(commitmentsMinor)?Math.max(0,commitmentsMinor):0;
  return {amountMinor:base===null?null:Math.max(0,base-pending),shortfallMinor:base===null?null:Math.max(0,pending-base),provisional:!input.complete,commitmentsMinor:pending};
}
