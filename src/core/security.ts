export type DeviceContext={id:string;label:string};

export function normalizeDeviceLabel(value:unknown){
  return String(value||'')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,60);
}

export function normalizeDeviceContext(value:unknown):DeviceContext|null{
  if(!value||typeof value!=='object') return null;
  const raw=value as {id?:unknown;label?:unknown};
  const id=String(raw.id||'').trim();
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(id)) return null;
  const label=normalizeDeviceLabel(raw.label)||'NestBalance device';
  return {id,label};
}

export function isNestBalanceSessionRevoked(authTimeSeconds:unknown,revokedBeforeSeconds:unknown){
  const authTime=Number(authTimeSeconds||0);
  const revokedBefore=Number(revokedBeforeSeconds||0);
  if(!Number.isFinite(authTime)||authTime<=0||!Number.isFinite(revokedBefore)||revokedBefore<=0) return false;
  return authTime<=revokedBefore;
}
