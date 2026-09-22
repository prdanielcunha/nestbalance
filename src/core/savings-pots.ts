import type { SavingsPotAutomation } from './savings-pot-automation.js';

export type SavingsPotLike={
  id:string;
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  targetDate?:string|null;
  note?:string|null;
  currency:string;
  institutionName:string|null;
  source:string|null;
  status:string;
  hasCover?:boolean;
  coverVersion?:number|null;
  automation?:SavingsPotAutomation|null;
  trackingMode?:'manual'|'bank_mirror';
  scope?:'household'|'personal';
};

export type SavingsPotGroup<T extends SavingsPotLike=SavingsPotLike>={
  key:string;
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  targetDate:string|null;
  note:string|null;
  currency:string;
  scope:'household'|'personal';
  progress:number|null;
  goalConflict:boolean;
  coverSourceId:string|null;
  automation:SavingsPotAutomation|null;
  trackingMode:'manual'|'bank_mirror'|'mixed';
  sources:T[];
};

export function normalizeSavingsPotName(value:string){
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}

export function groupSavingsPots<T extends SavingsPotLike>(items:T[]):SavingsPotGroup<T>[]{
  const grouped=new Map<string,T[]>();

  for(const item of items){
    if(item.status!=='active') continue;
    const scope=item.scope==='personal'?'personal':'household';
    const normalized=normalizeSavingsPotName(item.name)||item.id;
    const key=[scope,item.currency||'BRL',normalized].join('|');
    const current=grouped.get(key)||[];
    current.push(item);
    grouped.set(key,current);
  }

  return [...grouped.entries()].map(([key,sources])=>{
    const balanceMinor=sources.reduce((sum,item)=>sum+(Number.isSafeInteger(item.balanceMinor)?item.balanceMinor:0),0);
    const goals=sources
      .map(item=>item.goalMinor)
      .filter((value):value is number=>Number.isSafeInteger(value)&&value!>0);
    const uniqueGoals=[...new Set(goals)];
    const goalMinor=uniqueGoals.length?Math.max(...uniqueGoals):null;
    const progress=goalMinor&&goalMinor>0?Math.max(0,Math.min(1,balanceMinor/goalMinor)):null;
    const preferred=[...sources].sort((a,b)=>{
      const scoreA=(a.hasCover?1000:0)+(a.targetDate?100:0)+(a.note?10:0)+a.name.length;
      const scoreB=(b.hasCover?1000:0)+(b.targetDate?100:0)+(b.note?10:0)+b.name.length;
      return scoreB-scoreA;
    })[0];
    const groupScope:'household'|'personal'=preferred?.scope==='personal'?'personal':'household';
    const modes=new Set(sources.map(item=>item.trackingMode||(item.source==='screen_import'?'bank_mirror':'manual')));
    const trackingMode:'manual'|'bank_mirror'|'mixed'=modes.size>1?'mixed':modes.has('bank_mirror')?'bank_mirror':'manual';

    return {
      key,
      name:preferred?.name||'Cofrinho',
      balanceMinor,
      goalMinor,
      targetDate:preferred?.targetDate||null,
      note:preferred?.note||null,
      currency:preferred?.currency||'BRL',
      scope:groupScope,
      progress,
      goalConflict:uniqueGoals.length>1,
      coverSourceId:sources.find(item=>item.hasCover)?.id||null,
      automation:sources.find(item=>item.automation?.enabled)?.automation||null,
      trackingMode,
      sources:[...sources].sort((a,b)=>
        String(a.institutionName||'').localeCompare(String(b.institutionName||''),'pt-BR')
      )
    };
  }).sort((a,b)=>b.balanceMinor-a.balanceMinor||a.name.localeCompare(b.name,'pt-BR'));
}
