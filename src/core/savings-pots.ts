export type SavingsPotLike={
  id:string;
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  currency:string;
  institutionName:string|null;
  source:string|null;
  status:string;
  scope?:'household'|'personal';
};

export type SavingsPotGroup={
  key:string;
  name:string;
  balanceMinor:number;
  goalMinor:number|null;
  currency:string;
  scope:'household'|'personal';
  progress:number|null;
  goalConflict:boolean;
  sources:SavingsPotLike[];
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

export function groupSavingsPots(items:SavingsPotLike[]):SavingsPotGroup[]{
  const grouped=new Map<string,SavingsPotLike[]>();

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
    const preferred=[...sources].sort((a,b)=>b.name.length-a.name.length)[0];

    return {
      key,
      name:preferred?.name||'Cofrinho',
      balanceMinor,
      goalMinor,
      currency:preferred?.currency||'BRL',
      scope:preferred?.scope==='personal'?'personal':'household',
      progress,
      goalConflict:uniqueGoals.length>1,
      sources:[...sources].sort((a,b)=>
        String(a.institutionName||'').localeCompare(String(b.institutionName||''),'pt-BR')
      )
    };
  }).sort((a,b)=>b.balanceMinor-a.balanceMinor||a.name.localeCompare(b.name,'pt-BR'));
}
