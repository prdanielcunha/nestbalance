export type FinancialScope='household'|'personal';

export function normalizeFinancialScope(value:unknown):FinancialScope{
  return value==='personal'?'personal':'household';
}

export function scopedOwnerUid(scope:FinancialScope,uid:string){
  return scope==='personal'?uid:null;
}

export function canAccessScopedRecord(data:any,uid:string){
  const scope=normalizeFinancialScope(data?.scope);
  if(scope==='household') return true;
  return typeof data?.ownerUid==='string'&&data.ownerUid===uid;
}

export function canMutateScopedRecord(data:any,uid:string){
  return canAccessScopedRecord(data,uid);
}

export function scopedDedupNamespace(scope:FinancialScope,uid:string){
  return scope==='personal'?'personal:'+uid:'household';
}
