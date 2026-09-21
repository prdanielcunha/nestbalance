import { extractNativePdfText } from './pdf-text.js';

export const DOCUMENT_NATIVE_TEXT_MAX_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_NATIVE_TEXT_MAX_CHARACTERS = 100_000;

export type NativeDocumentTextResult =
  | { state:'extracted'; parser:string; text:string; characters:number; truncated:boolean; totalPages?:number; extractedPages?:number }
  | { state:'needs_ai'; reason:'visual_input'|'audio_input' }
  | { state:'unavailable'; parser:string; reason:string; totalPages?:number };

function normalizeText(text:string) {
  return text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\u0000/g,'').trim();
}

export async function extractNativeDocumentText(bytes:Buffer,mimeType:string):Promise<NativeDocumentTextResult> {
  if (mimeType.startsWith('image/')) return {state:'needs_ai',reason:'visual_input'};
  if (mimeType.startsWith('audio/')) return {state:'needs_ai',reason:'audio_input'};

  if (mimeType==='text/plain'||mimeType==='text/csv') {
    if (bytes.length>DOCUMENT_NATIVE_TEXT_MAX_BYTES) return {state:'unavailable',parser:'utf8-text-1',reason:'input_too_large'};
    const source=normalizeText(bytes.toString('utf8'));
    if (!source) return {state:'unavailable',parser:'utf8-text-1',reason:'extraction_empty'};
    const truncated=source.length>DOCUMENT_NATIVE_TEXT_MAX_CHARACTERS;
    const text=source.slice(0,DOCUMENT_NATIVE_TEXT_MAX_CHARACTERS);
    return {state:'extracted',parser:'utf8-text-1',text,characters:text.length,truncated};
  }

  if (mimeType==='application/pdf') {
    const result=await extractNativePdfText(bytes);
    if (result.state==='unavailable') return result;
    return result;
  }

  return {state:'unavailable',parser:'native-document-1',reason:'unsupported_type'};
}
