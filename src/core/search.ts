export type SearchableRecord={
  id:string;
  type:'movement'|'commitment'|'account'|'pot'|'document';
  label:string;
  secondary?:string|null;
  keywords?:string[];
};

export function normalizeSearchText(value:string){
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

export function searchTokens(query:string){
  return [...new Set(normalizeSearchText(query).split(' ').filter(token=>token.length>=2))].slice(0,8);
}

export function scoreSearchRecord(record:SearchableRecord,query:string){
  const normalizedQuery=normalizeSearchText(query);
  const tokens=searchTokens(query);
  if(!normalizedQuery||!tokens.length) return 0;
  const label=normalizeSearchText(record.label);
  const secondary=normalizeSearchText(record.secondary||'');
  const keywords=normalizeSearchText((record.keywords||[]).join(' '));
  const haystack=[label,secondary,keywords].filter(Boolean).join(' ');
  if(!tokens.every(token=>haystack.includes(token))) return 0;
  let score=10;
  if(label===normalizedQuery) score+=100;
  else if(label.startsWith(normalizedQuery)) score+=70;
  else if(label.includes(normalizedQuery)) score+=50;
  score+=tokens.reduce((sum,token)=>sum+(label.includes(token)?8:secondary.includes(token)?4:2),0);
  return score;
}

export function searchRecords(records:SearchableRecord[],query:string,limit=20){
  return records
    .map(record=>({record,score:scoreSearchRecord(record,query)}))
    .filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score||a.record.label.localeCompare(b.record.label))
    .slice(0,Math.max(1,Math.min(50,limit)))
    .map(item=>item.record);
}
