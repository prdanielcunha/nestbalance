'use client';

import { parseLocalCardText, type LocalCardReadResult } from '@/src/core/card-local-reader';
import { readImageTextLocally } from '@/src/lib/local-image-ocr';

export type LocalCardReadProgress={
  phase:'loading'|'reading'|'done';
  percent:number;
};

export async function readCardImageLocally(
  file:File,
  onProgress?:(progress:LocalCardReadProgress)=>void
):Promise<LocalCardReadResult>{
  if(!file.type.startsWith('image/')) throw new Error('CARD_IMAGE_REQUIRED');
  const text=await readImageTextLocally(file,onProgress);
  return parseLocalCardText(text);
}
