'use client';

let activeFlowId:string|null=null;

export function startCaptureTrace(){
  activeFlowId=crypto.randomUUID();
  return activeFlowId;
}

export function endCaptureTrace(){
  activeFlowId=null;
}

export function captureTraceHeaders(){
  return activeFlowId?{'x-nestbalance-flow-id':activeFlowId}:{};
}

export function currentCaptureTraceId(){
  return activeFlowId;
}
