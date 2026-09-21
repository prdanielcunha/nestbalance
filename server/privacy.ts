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
  const payload=`personal|${uid}|${sha256}`;
  let hash=2166136261;
  for(const ch of payload){
    hash^=ch.charCodeAt(0);
    hash=Math.imul(hash,16777619);
  }
  return `personal_${uid.replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)}_${(hash>>>0).toString(16)}_${sha256.slice(0,24)}`;
}
