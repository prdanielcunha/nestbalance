'use client';

export type CaptureProgressStage='receiving'|'reading'|'understanding'|'comparing'|'ready';

const ORDER:CaptureProgressStage[]=['receiving','reading','understanding','comparing','ready'];

export function CaptureProgress({stage,labels}:{stage:CaptureProgressStage;labels:Record<CaptureProgressStage,string>}){
  const active=ORDER.indexOf(stage);
  return <ol className="capture-stage-progress" aria-label={labels[stage]}>
    {ORDER.map((item,index)=><li key={item} className={index<active?'done':index===active?'active':''} aria-current={index===active?'step':undefined}>
      <span aria-hidden="true">{index<active?'✓':index+1}</span>
      <b>{labels[item]}</b>
    </li>)}
  </ol>;
}
