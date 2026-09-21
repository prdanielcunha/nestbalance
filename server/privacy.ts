import { createHash } from 'node:crypto';

export type FinancialVisibility = 'household' | 'personal';

export function normalizeFinancialVisibility(value:unknown):FinancialVisibility{
  return value==='personal'?'personal':'household';
}

export function privacyFields(visibility:FinancialVisibility,uid:string){
  return visibility==='personal'
    ? {scope:'personal' as const,ownerUid:uid}
    : {scope:'household' as const,ownerUid:null};
}

export function canViewFinancialRecord(data:any,uid:string){
  const visibility=normalizeFinancialVisibility(data?.scope);
  if(visibility==='household') return true;
  return String(data?.ownerUid||data?.createdBy||data?.uploadedBy||data?.importedBy||'')===uid;
}

export function assertCanViewFinancialRecord(data:any,uid:string){
  if(!canViewFinancialRecord(data,uid)){
    throw Object.assign(new Error('FINANCIAL_PRIVACY_DENIED'),{statusCode:403});
  }
}

export function personalEvidenceHashIndexId(sha256:string,visibility:FinancialVisibility,uid:string){
  if(visibility==='household') return sha256;
  return 'personal_'+createHash('sha256').update(`personal|${uid}|${sha256}`).digest('hex');
}
