'use client';

import { CaptureInputView } from '@/src/features/capture/capture-input-view';
import { CaptureReviewView } from '@/src/features/capture/capture-review-view';
import { useUniversalCaptureController } from '@/src/lib/capture/use-universal-capture-controller';

export function UniversalCapture({
  householdId,
  uid,
  onCommitted,
  defaultOpen=false,
  showTrigger=true,
  onClose
}:{
  householdId:string;
  uid:string;
  onCommitted?:()=>void;
  defaultOpen?:boolean;
  showTrigger?:boolean;
  onClose?:()=>void;
}){
  const c=useUniversalCaptureController({householdId,uid,onCommitted,defaultOpen,onClose});
  const reviewing=c.interpretations.length>0||Boolean(c.screenSnapshot);
  return <>
    {showTrigger&&<button className="capture-fab" onClick={()=>c.setOpen(true)} aria-label={c.t.add}>＋ <span>{c.t.add}</span></button>}
    {c.open&&<div className="sheet-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&c.reset()}>
      <section className="capture-sheet" role="dialog" aria-modal="true" aria-label={c.t.captureTitle}>
        {reviewing?<CaptureReviewView c={c}/>:<CaptureInputView c={c}/>}
      </section>
    </div>}
  </>;
}
