'use client';
import { normalizeDeviceContext, type DeviceContext } from '@/src/core/security';

const STORAGE_KEY='nestbalance.device.v1';

function coarseDeviceLabel(){
  if(typeof navigator==='undefined') return 'Browser';
  const ua=navigator.userAgent||'';
  const platform=(navigator as Navigator & {userAgentData?:{platform?:string}}).userAgentData?.platform||navigator.platform||'';
  if(/iPhone/i.test(ua)) return 'iPhone';
  if(/iPad/i.test(ua)) return 'iPad';
  if(/Android/i.test(ua)) return /Mobile/i.test(ua)?'Android phone':'Android tablet';
  if(/Mac/i.test(platform)||/Macintosh/i.test(ua)) return 'Mac';
  if(/Win/i.test(platform)||/Windows/i.test(ua)) return 'Windows PC';
  if(/Linux/i.test(platform)||/Linux/i.test(ua)) return 'Linux device';
  return 'Browser';
}

export function getNestBalanceDeviceContext():DeviceContext|null{
  if(typeof window==='undefined') return null;
  try{
    const existing=window.localStorage.getItem(STORAGE_KEY);
    if(existing){
      const parsed=normalizeDeviceContext(JSON.parse(existing));
      if(parsed) return parsed;
    }
    const generated={
      id:typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
        ? crypto.randomUUID()
        : `nb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,18)}`,
      label:coarseDeviceLabel()
    };
    const normalized=normalizeDeviceContext(generated);
    if(!normalized) return null;
    window.localStorage.setItem(STORAGE_KEY,JSON.stringify(normalized));
    return normalized;
  }catch{
    return null;
  }
}
