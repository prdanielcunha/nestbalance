import { createHash } from 'node:crypto';
import { canAccessScopedRecord, normalizeFinancialScope, scopedDedupNamespace, scopedOwnerUid, type FinancialScope } from '../src/core/privacy.js';

export function requestedScope(value:unknown):FinancialScope{ return normalizeFinancialScope(value); }

export function scopeFields(value:unknown,uid:string){
  const scope=requestedScope(value);
  return {scope,ownerUid:scopedOwnerUid(scope,uid)};
}

export function assertScopedAccess(data:any,uid:string){
  if(!canAccessScopedRecord(data,uid)) throw Object.assign(new Error('PRIVATE_RECORD_ACCESS_DENIED'),{statusCode:403});
  return data;
}

export function scopedHashId(sha256:string,scope:FinancialScope,uid:string){
  if(scope==='household') return sha256;
  return createHash('sha256').update(scopedDedupNamespace(scope,uid)+'|'+sha256).digest('hex');
}

export function visibleDocs<T extends {data:()=>any}>(docs:T[],uid:string){
  return docs.filter(doc=>canAccessScopedRecord(doc.data(),uid));
}
