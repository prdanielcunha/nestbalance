'use client';

export type ProductEventName=
  | 'first_value_observed'
  | 'capture_opened'
  | 'capture_review_ready'
  | 'capture_committed'
  | 'capture_queued'
  | 'capture_abandoned';

export type CaptureSourceKind='text'|'image'|'pdf'|'csv'|'audio'|'other';

type ProductEventDetails={
  source?:CaptureSourceKind;
  durationMs?:number;
  itemCount?:number;
  reviewCount?:number;
};

function boundedInteger(value:unknown,max:number){
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<0) return undefined;
  return Math.min(max,Math.round(parsed));
}

export function reportProductEvent(name:ProductEventName,details:ProductEventDetails={}){
  if(process.env.NEXT_PUBLIC_NESTBALANCE_E2E==='true'||typeof window==='undefined') return;

  const payload=JSON.stringify({
    name,
    route:window.location.pathname,
    source:details.source,
    durationMs:boundedInteger(details.durationMs,30*60_000),
    itemCount:boundedInteger(details.itemCount,500),
    reviewCount:boundedInteger(details.reviewCount,500)
  });

  void fetch('/api/metrics/product-event',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:payload,
    keepalive:true,
    credentials:'omit'
  }).catch(()=>undefined);
}
