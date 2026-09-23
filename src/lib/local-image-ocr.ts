'use client';

export type LocalOcrProgress={
  phase:'loading'|'reading'|'done';
  percent:number;
};

export async function readImageTextLocally(
  file:File,
  onProgress?:(progress:LocalOcrProgress)=>void,
  locale='pt-BR'
):Promise<string>{
  if(!file.type.startsWith('image/')) throw new Error('IMAGE_REQUIRED');
  onProgress?.({phase:'loading',percent:5});

  const {createWorker,OEM}=await import('tesseract.js');
  onProgress?.({phase:'loading',percent:20});
  const language=locale.startsWith('en')?'eng':locale.startsWith('es')?'spa':'por';
  const worker=await createWorker(language,OEM.LSTM_ONLY,{
    logger(message:any){
      if(message?.status==='recognizing text'&&typeof message.progress==='number'){
        onProgress?.({phase:'reading',percent:Math.max(25,Math.min(95,Math.round(25+message.progress*70)))});
      }
    }
  });

  try{
    const result=await worker.recognize(file);
    const text=String(result?.data?.text||'').normalize('NFKC').replace(/\r\n?/g,'\n').trim();
    onProgress?.({phase:'done',percent:100});
    return text;
  }finally{
    await worker.terminate();
  }
}
