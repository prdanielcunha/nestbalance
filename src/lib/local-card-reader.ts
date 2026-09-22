'use client';

import { parseLocalCardText, type LocalCardReadResult } from '@/src/core/card-local-reader';

export type LocalCardReadProgress={
  phase:'loading'|'reading'|'done';
  percent:number;
};

export async function readCardImageLocally(
  file:File,
  onProgress?:(progress:LocalCardReadProgress)=>void
):Promise<LocalCardReadResult>{
  if(!file.type.startsWith('image/')) throw new Error('CARD_IMAGE_REQUIRED');
  onProgress?.({phase:'loading',percent:5});

  const {createWorker,OEM}=await import('tesseract.js');
  onProgress?.({phase:'loading',percent:20});
  const worker=await createWorker('por',OEM.LSTM_ONLY,{
    logger(message:any){
      if(message?.status==='recognizing text'&&typeof message.progress==='number'){
        onProgress?.({phase:'reading',percent:Math.max(25,Math.min(95,Math.round(25+message.progress*70)))});
      }
    }
  });

  try{
    const result=await worker.recognize(file);
    const parsed=parseLocalCardText(String(result?.data?.text||''));
    onProgress?.({phase:'done',percent:100});
    return parsed;
  }finally{
    await worker.terminate();
  }
}
