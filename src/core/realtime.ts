export type SyncDomain=
  | 'home'
  | 'movements'
  | 'accounts'
  | 'invoices'
  | 'pots'
  | 'documents'
  | 'assistant'
  | 'household'
  | 'activity';

function add(target:Set<SyncDomain>,...domains:SyncDomain[]){
  for(const domain of domains) target.add(domain);
}

export function syncDomainsForAuditType(value:unknown):SyncDomain[]{
  const type=String(value||'').trim().toLowerCase();
  const domains=new Set<SyncDomain>(['home','activity']);

  if(/transaction|movement|category|recurrence|commitment|payment/.test(type)){
    add(domains,'movements','assistant');
  }
  if(/account/.test(type)){
    add(domains,'accounts','assistant');
  }
  if(/card|invoice|installment/.test(type)){
    add(domains,'accounts','invoices','assistant');
  }
  if(/saving|pot|cofrinho/.test(type)){
    add(domains,'pots','assistant');
  }
  if(/evidence|vault|document/.test(type)){
    add(domains,'documents');
  }
  if(/household|member|invite|role|privacy|security|session/.test(type)){
    add(domains,'household');
  }
  if(/attention|proactivity|assistant|insight/.test(type)){
    add(domains,'assistant');
  }

  return [...domains];
}

export function syncDomainIntersects(changed:readonly SyncDomain[],subscribed:readonly SyncDomain[]){
  if(!subscribed.length) return true;
  return changed.some(domain=>subscribed.includes(domain));
}
