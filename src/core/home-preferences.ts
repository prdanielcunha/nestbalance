export type HomeMode='person'|'couple'|'family';
export type IncomeFrequency='monthly'|'biweekly'|'weekly'|'variable';

export type HomePreferences={
  mode:HomeMode;
  incomeFrequency:IncomeFrequency;
};

export const DEFAULT_HOME_PREFERENCES:HomePreferences={
  mode:'person',
  incomeFrequency:'monthly'
};

export function normalizeHomePreferences(value:unknown):HomePreferences{
  const source=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const mode:HomeMode=source.mode==='couple'||source.mode==='family'||source.mode==='person'
    ? source.mode
    : DEFAULT_HOME_PREFERENCES.mode;
  const incomeFrequency:IncomeFrequency=source.incomeFrequency==='biweekly'||source.incomeFrequency==='weekly'||source.incomeFrequency==='variable'||source.incomeFrequency==='monthly'
    ? source.incomeFrequency
    : DEFAULT_HOME_PREFERENCES.incomeFrequency;
  return {mode,incomeFrequency};
}
