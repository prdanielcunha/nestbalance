'use client';
import { normalizeRaisedCents } from '@/src/core/raised-cents';
import { accountInstitutionFromOcr } from '@/src/core/account-balance-import';

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

  const {createWorker,OEM,PSM}=await import('tesseract.js');
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
    const result=await worker.recognize(file,{}, {text:true,blocks:true});
    let text=String(result?.data?.text||'').normalize('NFKC').replace(/\r\n?/g,'\n').trim();
    // Recover visibly raised cents using their actual pixels. Normal OCR often
    // loses them because it assumes every digit shares the same baseline.
    try{
    const bitmap=await createImageBitmap(file);
    try{
      const canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(context){
        context.drawImage(bitmap,0,0);
        let repaired=0;
        for(const block of result.data.blocks||[]) for(const paragraph of block.paragraphs) for(const line of paragraph.lines){
          if(repaired>=3||!/R\$/i.test(line.text)) continue;
          const word=line.words.find(item=>/^R\$/i.test(item.text));
          if(!word) continue;
          const {x0,y0,x1,y1}=word.bbox;
          const pixels=context.getImageData(x0,y0,x1-x0,y1-y0);
          const normalized=normalizeRaisedCents(pixels);
          if(!normalized) continue;
          const region=document.createElement('canvas');
          region.width=normalized.width;region.height=normalized.height;
          const regionContext=region.getContext('2d');
          if(!regionContext) continue;
          regionContext.putImageData(new ImageData(normalized.data as Uint8ClampedArray<ArrayBuffer>,normalized.width,normalized.height),0,0);
          await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,tessedit_char_whitelist:'R$0123456789'});
          const retry=await worker.recognize(region);
          const recovered=retry.data.text.trim();
          const match=/^R\$\s*(\d{3,})$/.exec(recovered);
          if(!match) continue;
          const digits=match[1];
          const money='R$ '+digits.slice(0,-2)+','+digits.slice(-2);
          text=text.replace(word.text.normalize('NFKC'),money);
          repaired++;
        }
      }
    }finally{bitmap.close();}
    }catch{
      // Optional pixel enhancement must never discard a successful first read.
    }
    if(/\bsaldo\b/i.test(text)&&!accountInstitutionFromOcr(text)){
      // Sparse layout finds app/product labels that the normal pass can miss.
      // Keep the original amounts and use this pass only for institution cues.
      try{
        await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,tessedit_char_whitelist:''});
        const alternate=await worker.recognize(file);
        const institution=accountInstitutionFromOcr(alternate.data.text);
        if(institution) text=institution+'\n'+text;
      }catch{
        // The first read remains available even if the second pass fails.
      }
    }

    onProgress?.({phase:'done',percent:100});
    return text;
  }finally{
    await worker.terminate();
  }
}
