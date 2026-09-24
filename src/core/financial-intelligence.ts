import {
  deriveFinancialAnomalies,
  deriveRecurringCandidates,
  deriveSpendingComparison,
  recurringPatternKey,
  resolvedSpendingCategory,
  type InsightTransaction,
  type SpendingCategory
} from './insights.js';

export type InsightConfidence='high'|'medium';
export type InsightUrgency='critical'|'high'|'normal'|'low';

export type ExplainableInsight={
  id:string;
  type:'possible_duplicate'|'amount_increase'|'spending_change'|'subscription'|'due_bill'|'pot_reserve';
  urgency:InsightUrgency;
  confidence:InsightConfidence;
  sourceIds:string[];
  premise:string;
  action:'review_movements'|'review_commitment'|'open_pots'|'open_assistant';
  amountMinor:number|null;
  baselineMinor:number|null;
  category?:SpendingCategory;
  dueDay?:number|null;
  patternKey?:string;
};

export type IntelligenceCommitment={
  id:string;
  description:string;
  amountMinor:number;
  status?:string;
  dueDay?:number|null;
  recurring?:boolean;
  paidThisMonth?:boolean;
};

export type IntelligencePot={
  id:string;
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  targetDate:string|null;
};

export type PotReserveSuggestion={
  potId:string;
  name:string;
  suggestedMinor:number;
  remainingMinor:number;
  premise:'weekly_pace_with_known_surplus';
};

export type ScenarioInput={
  availableMinor:number;
  committedMinor:number;
  amountMinor:number;
  kind:'purchase'|'income_drop'|'extra_income'|'debt_payment';
};

export type ScenarioResult={
  baselineRemainderMinor:number;
  projectedRemainderMinor:number;
  deltaMinor:number;
  kind:ScenarioInput['kind'];
};

export type MonthlyCloseCheck={
  key:'accounts'|'uncertain_items'|'open_bills'|'documents'|'duplicates';
  status:'done'|'attention';
  count:number;
};

function currentDay(now:Date){
  return now.getDate();
}

export function simulateFinancialScenario(input:ScenarioInput):ScenarioResult{
  const baseline=input.availableMinor-input.committedMinor;
  const amount=Math.max(0,Math.round(input.amountMinor));
  const delta=input.kind==='extra_income'?amount:-amount;
  return {
    baselineRemainderMinor:baseline,
    projectedRemainderMinor:baseline+delta,
    deltaMinor:delta,
    kind:input.kind
  };
}

export function reserveSuggestion(args:{
  pots:IntelligencePot[];
  projectedRemainderMinor:number;
  now?:Date;
}):PotReserveSuggestion|null{
  const now=args.now||new Date();
  const candidates=args.pots
    .filter(pot=>pot.goalMinor&&pot.goalMinor>pot.balanceMinor&&pot.targetDate&&/^\d{4}-\d{2}-\d{2}$/.test(pot.targetDate))
    .map(pot=>{
      const remaining=Math.max(0,(pot.goalMinor||0)-pot.balanceMinor);
      const target=new Date(pot.targetDate+'T12:00:00Z').getTime();
      const days=Math.ceil((target-now.getTime())/86_400_000);
      const weeks=Math.max(1,Math.ceil(days/7));
      return {...pot,remaining,days,weekly:Math.ceil(remaining/weeks)};
    })
    .filter(pot=>pot.days>0&&pot.weekly>0)
    .sort((a,b)=>a.days-b.days||b.remaining-a.remaining);

  const pot=candidates[0];
  const safeSurplus=Math.max(0,args.projectedRemainderMinor);
  if(!pot||safeSurplus<=0) return null;
  const suggestedMinor=Math.min(pot.weekly,Math.max(0,Math.floor(safeSurplus*.25)));
  if(suggestedMinor<=0) return null;
  return {
    potId:pot.id,
    name:pot.name,
    suggestedMinor,
    remainingMinor:pot.remaining,
    premise:'weekly_pace_with_known_surplus'
  };
}

export function deriveExplainableInsights(args:{
  transactions:InsightTransaction[];
  commitments:IntelligenceCommitment[];
  pots?:IntelligencePot[];
  projectedRemainderMinor?:number;
  now?:Date;
}):ExplainableInsight[]{
  const now=args.now||new Date();
  const insights:ExplainableInsight[]=[];
  const anomalies=deriveFinancialAnomalies(args.transactions,now);

  for(const anomaly of anomalies){
    if(anomaly.type==='possible_duplicate'){
      insights.push({
        id:`duplicate:${anomaly.transactionId}`,
        type:'possible_duplicate',
        urgency:'high',
        confidence:'high',
        sourceIds:[anomaly.transactionId],
        premise:'same_normalized_description_amount_and_day',
        action:'review_movements',
        amountMinor:anomaly.amountMinor,
        baselineMinor:null
      });
    }else{
      insights.push({
        id:`increase:${anomaly.transactionId}`,
        type:'amount_increase',
        urgency:'normal',
        confidence:'medium',
        sourceIds:[anomaly.transactionId],
        premise:'current_amount_at_least_35_percent_and_50_brl_above_recent_median',
        action:'review_movements',
        amountMinor:anomaly.amountMinor,
        baselineMinor:anomaly.baselineMinor
      });
    }
  }

  const comparison=deriveSpendingComparison(args.transactions,now);
  const top=comparison.topIncreases[0];
  if(comparison.hasComparableData&&comparison.deltaMinor>0&&top){
    const sourceIds=args.transactions
      .filter(row=>row.direction==='expense'&&String(row.observedOn||'').startsWith(comparison.currentMonthKey)&&resolvedSpendingCategory(row)===top.category)
      .map(row=>row.id)
      .slice(0,12);
    insights.push({
      id:`spending:${comparison.currentMonthKey}:${top.category}`,
      type:'spending_change',
      urgency:'normal',
      confidence:comparison.currentCount>=4&&comparison.previousCount>=4?'high':'medium',
      sourceIds,
      premise:'current_month_compared_with_previous_month_known_expenses',
      action:'open_assistant',
      amountMinor:comparison.deltaMinor,
      baselineMinor:comparison.previousMinor,
      category:top.category
    });
  }

  const recurring=deriveRecurringCandidates(args.transactions);
  for(const candidate of recurring){
    const normalized=recurringPatternKey(candidate.description);
    if(!/netflix|spotify|prime|disney|youtube|icloud|google one|hbo|max|assinatura|subscription/.test(normalized)) continue;
    insights.push({
      id:`subscription:${candidate.key}`,
      type:'subscription',
      urgency:'low',
      confidence:candidate.observedMonths>=4?'high':'medium',
      sourceIds:[candidate.referenceTransactionId],
      premise:'stable_expense_observed_in_at_least_three_months',
      action:'review_movements',
      amountMinor:candidate.averageMinor,
      baselineMinor:null,
      patternKey:candidate.key
    });
  }

  const day=currentDay(now);
  for(const commitment of args.commitments){
    if(commitment.status==='cancelled'||commitment.paidThisMonth||!commitment.dueDay) continue;
    const delta=commitment.dueDay-day;
    if(delta>3) continue;
    insights.push({
      id:`due:${commitment.id}`,
      type:'due_bill',
      urgency:delta<0?'critical':delta<=1?'high':'normal',
      confidence:'high',
      sourceIds:[commitment.id],
      premise:delta<0?'known_bill_due_day_already_passed':'known_bill_due_within_three_days',
      action:'review_commitment',
      amountMinor:commitment.amountMinor,
      baselineMinor:null,
      dueDay:commitment.dueDay
    });
  }

  const pot=reserveSuggestion({
    pots:args.pots||[],
    projectedRemainderMinor:args.projectedRemainderMinor||0,
    now
  });
  if(pot){
    insights.push({
      id:`pot:${pot.potId}`,
      type:'pot_reserve',
      urgency:'low',
      confidence:'medium',
      sourceIds:[pot.potId],
      premise:pot.premise,
      action:'open_pots',
      amountMinor:pot.suggestedMinor,
      baselineMinor:pot.remainingMinor
    });
  }

  const rank:Record<InsightUrgency,number>={critical:0,high:1,normal:2,low:3};
  return insights.sort((a,b)=>rank[a.urgency]-rank[b.urgency]).slice(0,12);
}

export function buildMonthlyCloseChecklist(args:{
  accountsCount:number;
  uncertainItems:number;
  unpaidCommitments:number;
  missingDocuments:number;
  possibleDuplicates:number;
}):MonthlyCloseCheck[]{
  return [
    {key:'accounts',status:args.accountsCount>0?'done':'attention',count:args.accountsCount},
    {key:'uncertain_items',status:args.uncertainItems===0?'done':'attention',count:args.uncertainItems},
    {key:'open_bills',status:args.unpaidCommitments===0?'done':'attention',count:args.unpaidCommitments},
    {key:'documents',status:args.missingDocuments===0?'done':'attention',count:args.missingDocuments},
    {key:'duplicates',status:args.possibleDuplicates===0?'done':'attention',count:args.possibleDuplicates}
  ];
}
