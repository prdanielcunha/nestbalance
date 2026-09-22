export function normalizeIsoDate(value:unknown):string|null{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year,month,day]=value.split('-').map(Number);
  const parsed=new Date(year,month-1,day);
  if(
    parsed.getFullYear()!==year||
    parsed.getMonth()!==month-1||
    parsed.getDate()!==day
  ) return null;
  return value;
}

export function isValidIsoDate(value:unknown):value is string{
  return normalizeIsoDate(value)!==null;
}
