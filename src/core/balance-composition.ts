export type BalanceCoverage='excludes_pots'|'includes_pots'|'unknown';
export type BalanceAccount={id:string;balanceMinor:number|null;currency:string;status:string;connectedProductType?:string|null;balanceCoverage?:BalanceCoverage;includedSavingsMinor?:number|null;balanceAsOfMs?:number|null};
export type BalancePot={id:string;balanceMinor:number;currency:string;status:string;updatedAtMs?:number|null};

// Coverage is explicitly confirmed per account. Never infer that all pots at a
// bank belong to a particular account, or subtract a partial screenshot total.
export function deriveBalanceComposition<A extends BalanceAccount,P extends BalancePot>(accounts:A[],pots:P[],currency='BRL',now=Date.now()){
  const rows=accounts.filter(a=>a.status==='active'&&a.currency===currency&&a.connectedProductType!=='investment').map(account=>{
    const known=Number.isSafeInteger(account.balanceMinor);
    const coverage=account.balanceCoverage||'unknown';
    const included=account.includedSavingsMinor;
    const resolved=known&&(coverage==='excludes_pots'||(coverage==='includes_pots'&&Number.isSafeInteger(included)&&included!>=0&&included!<=account.balanceMinor!));
    return {account,amountMinor:resolved?account.balanceMinor!-(coverage==='includes_pots'?included!:0):null,stale:!account.balanceAsOfMs||now-account.balanceAsOfMs>7*86_400_000};
  });
  const sources=pots.filter(p=>p.status==='active'&&p.currency===currency);
  const savedMinor=sources.reduce((s,p)=>s+(Number.isSafeInteger(p.balanceMinor)?p.balanceMinor:0),0);
  const complete=rows.length>0&&rows.every(r=>r.amountMinor!==null);
  return {rows,sources,savedMinor,outsideMinor:complete?rows.reduce((s,r)=>s+r.amountMinor!,0):null,complete,stale:rows.some(r=>r.stale)||sources.some(p=>!p.updatedAtMs||now-p.updatedAtMs>7*86_400_000),otherCurrencies:[...new Set([...accounts,...pots].filter(x=>x.status==='active'&&x.currency!==currency).map(x=>x.currency))]};
}
