import type { Request, Response } from 'express';

const VITAL_NAMES=new Set(['CLS','FCP','FID','INP','LCP','TTFB']);
const RATINGS=new Set(['good','needs-improvement','poor']);
const NAVIGATION_TYPES=new Set(['navigate','reload','back-forward','prerender']);

function routeKey(pathname:unknown){
  const raw=typeof pathname==='string'?pathname:'';
  if(raw==='/') return 'home';
  const segment=raw.split('?')[0].split('#')[0].split('/').filter(Boolean)[0]||'other';
  return new Set(['movements','accounts','pots','assistant','add','vault','household','privacy','activity']).has(segment)
    ? segment
    : 'other';
}

function normalizedValue(name:string,value:unknown){
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<0) return null;
  const max=name==='CLS'?10:120_000;
  if(parsed>max) return null;
  return name==='CLS'?Math.round(parsed*100_000)/100_000:Math.round(parsed);
}

export function recordWebVital(req:Request,res:Response){
  const name=String(req.body?.name||'').toUpperCase();
  if(!VITAL_NAMES.has(name)) return res.status(400).json({ok:false,error:'INVALID_METRIC'});

  const value=normalizedValue(name,req.body?.value);
  if(value===null) return res.status(400).json({ok:false,error:'INVALID_METRIC_VALUE'});

  const ratingRaw=String(req.body?.rating||'');
  const navigationRaw=String(req.body?.navigationType||'');
  const rating=RATINGS.has(ratingRaw)?ratingRaw:null;
  const navigationType=NAVIGATION_TYPES.has(navigationRaw)?navigationRaw:null;

  console.log(JSON.stringify({
    event:'product_web_vital',
    metric:name,
    value,
    rating,
    route:routeKey(req.body?.route),
    navigationType
  }));

  return res.status(204).end();
}
