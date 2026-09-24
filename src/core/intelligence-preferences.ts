export type IntelligencePreferences={
  duplicates:boolean;
  amountIncreases:boolean;
  spendingChanges:boolean;
  subscriptions:boolean;
  dueBills:boolean;
  potSuggestions:boolean;
  minimumUrgency:'critical'|'high'|'normal'|'low';
  channels:{
    inApp:boolean;
    device:boolean;
  };
};

export const DEFAULT_INTELLIGENCE_PREFERENCES:IntelligencePreferences={
  duplicates:true,
  amountIncreases:true,
  spendingChanges:true,
  subscriptions:true,
  dueBills:true,
  potSuggestions:true,
  minimumUrgency:'normal',
  channels:{inApp:true,device:false}
};

export function normalizeIntelligencePreferences(value:unknown):IntelligencePreferences{
  const data=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const channels=data.channels&&typeof data.channels==='object'?data.channels as Record<string,unknown>:{};
  const urgency=data.minimumUrgency;
  return {
    duplicates:typeof data.duplicates==='boolean'?data.duplicates:DEFAULT_INTELLIGENCE_PREFERENCES.duplicates,
    amountIncreases:typeof data.amountIncreases==='boolean'?data.amountIncreases:DEFAULT_INTELLIGENCE_PREFERENCES.amountIncreases,
    spendingChanges:typeof data.spendingChanges==='boolean'?data.spendingChanges:DEFAULT_INTELLIGENCE_PREFERENCES.spendingChanges,
    subscriptions:typeof data.subscriptions==='boolean'?data.subscriptions:DEFAULT_INTELLIGENCE_PREFERENCES.subscriptions,
    dueBills:typeof data.dueBills==='boolean'?data.dueBills:DEFAULT_INTELLIGENCE_PREFERENCES.dueBills,
    potSuggestions:typeof data.potSuggestions==='boolean'?data.potSuggestions:DEFAULT_INTELLIGENCE_PREFERENCES.potSuggestions,
    minimumUrgency:urgency==='critical'||urgency==='high'||urgency==='normal'||urgency==='low'?urgency:DEFAULT_INTELLIGENCE_PREFERENCES.minimumUrgency,
    channels:{
      inApp:typeof channels.inApp==='boolean'?channels.inApp:DEFAULT_INTELLIGENCE_PREFERENCES.channels.inApp,
      device:typeof channels.device==='boolean'?channels.device:DEFAULT_INTELLIGENCE_PREFERENCES.channels.device
    }
  };
}

const rank={critical:0,high:1,normal:2,low:3} as const;

export function acceptsInsightPreference(
  preferences:IntelligencePreferences,
  input:{type:string;urgency:'critical'|'high'|'normal'|'low'}
){
  if(!preferences.channels.inApp) return false;
  if(rank[input.urgency]>rank[preferences.minimumUrgency]) return false;
  if(input.type==='possible_duplicate'&&!preferences.duplicates) return false;
  if(input.type==='amount_increase'&&!preferences.amountIncreases) return false;
  if(input.type==='spending_change'&&!preferences.spendingChanges) return false;
  if(input.type==='subscription'&&!preferences.subscriptions) return false;
  if(input.type==='due_bill'&&!preferences.dueBills) return false;
  if(input.type==='pot_reserve'&&!preferences.potSuggestions) return false;
  return true;
}
