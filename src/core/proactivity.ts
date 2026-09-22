export type ProactivityPreferences={
  dueBills:boolean;
  anomalies:boolean;
  spendingChanges:boolean;
  installmentEnds:boolean;
};

export const DEFAULT_PROACTIVITY_PREFERENCES:ProactivityPreferences={
  dueBills:true,
  anomalies:true,
  spendingChanges:true,
  installmentEnds:false
};

export function normalizeProactivityPreferences(value:unknown):ProactivityPreferences{
  const data=value&&typeof value==='object'?value as Record<string,unknown>:{};
  return {
    dueBills:typeof data.dueBills==='boolean'?data.dueBills:DEFAULT_PROACTIVITY_PREFERENCES.dueBills,
    anomalies:typeof data.anomalies==='boolean'?data.anomalies:DEFAULT_PROACTIVITY_PREFERENCES.anomalies,
    spendingChanges:typeof data.spendingChanges==='boolean'?data.spendingChanges:DEFAULT_PROACTIVITY_PREFERENCES.spendingChanges,
    installmentEnds:typeof data.installmentEnds==='boolean'?data.installmentEnds:DEFAULT_PROACTIVITY_PREFERENCES.installmentEnds
  };
}

export function parseProactivityPreferences(value:unknown):ProactivityPreferences|null{
  if(!value||typeof value!=='object') return null;
  const data=value as Record<string,unknown>;
  const keys=['dueBills','anomalies','spendingChanges','installmentEnds'] as const;
  if(keys.some(key=>typeof data[key]!=='boolean')) return null;
  return {
    dueBills:data.dueBills as boolean,
    anomalies:data.anomalies as boolean,
    spendingChanges:data.spendingChanges as boolean,
    installmentEnds:data.installmentEnds as boolean
  };
}
