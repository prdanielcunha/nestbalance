'use client';
import { useReportWebVitals } from 'next/web-vitals';

type Metric=Parameters<typeof useReportWebVitals>[0] extends (metric:infer T)=>unknown?T:never;

function reportMetric(metric:Metric){
  if(process.env.NEXT_PUBLIC_NESTBALANCE_E2E==='true') return;
  const payload=JSON.stringify({
    name:metric.name,
    value:metric.value,
    rating:metric.rating,
    navigationType:metric.navigationType,
    route:window.location.pathname
  });

  try{
    if(navigator.sendBeacon){
      const accepted=navigator.sendBeacon('/api/metrics/web-vital',new Blob([payload],{type:'application/json'}));
      if(accepted) return;
    }
  }catch{
    // Fall through to keepalive fetch. Metrics must never affect the product flow.
  }

  void fetch('/api/metrics/web-vital',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:payload,
    keepalive:true,
    credentials:'omit'
  }).catch(()=>undefined);
}

export function ProductMetricsRuntime(){
  useReportWebVitals(reportMetric);
  return null;
}
