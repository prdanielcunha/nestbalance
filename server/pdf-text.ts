import { getDocumentProxy } from 'unpdf';

export const PDF_TEXT_MAX_INPUT_BYTES = 4 * 1024 * 1024;
export const PDF_TEXT_MAX_PAGES = 40;
export const PDF_TEXT_MAX_CHARACTERS = 100_000;
const PDF_TEXT_MAX_IMAGE_PIXELS = 4_194_304;

export type NativePdfTextResult =
  | { state:'extracted'; parser:'unpdf-pdfjs-1'; text:string; totalPages:number; extractedPages:number; characters:number; truncated:boolean }
  | { state:'unavailable'; parser:'unpdf-pdfjs-1'; reason:'input_too_large'|'encrypted'|'invalid_pdf'|'page_limit_exceeded'|'extraction_empty'|'parser_error'; totalPages?:number };

function appendBounded(target:string,value:string) {
  if (!value || target.length>=PDF_TEXT_MAX_CHARACTERS) return {text:target,truncated:target.length>=PDF_TEXT_MAX_CHARACTERS};
  const available=PDF_TEXT_MAX_CHARACTERS-target.length;
  return value.length<=available ? {text:target+value,truncated:false} : {text:target+value.slice(0,available),truncated:true};
}

function pageText(content:any) {
  let text='';
  for (const item of Array.isArray(content?.items)?content.items:[]) {
    if (!item || typeof item.str!=='string' || !item.str) continue;
    if (text && !/\s$/.test(text)) text+=' ';
    text+=item.str;
    if (item.hasEOL===true) text+='\n';
  }
  return text.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

export async function extractNativePdfText(bytes:Buffer):Promise<NativePdfTextResult> {
  if (bytes.length>PDF_TEXT_MAX_INPUT_BYTES) return {state:'unavailable',parser:'unpdf-pdfjs-1',reason:'input_too_large'};
  if (bytes.subarray(0,5).toString('ascii')!=='%PDF-') return {state:'unavailable',parser:'unpdf-pdfjs-1',reason:'invalid_pdf'};
  const lexical=bytes.toString('latin1');
  if (/\/Encrypt\b/.test(lexical)) return {state:'unavailable',parser:'unpdf-pdfjs-1',reason:'encrypted'};

  let pdf:any=null;
  try {
    pdf=await getDocumentProxy(new Uint8Array(bytes),{
      maxImageSize:PDF_TEXT_MAX_IMAGE_PIXELS,
      disableAutoFetch:true,
      disableStream:true
    });
    const totalPages=Number(pdf?.numPages||0);
    if (!Number.isSafeInteger(totalPages)||totalPages<1) return {state:'unavailable',parser:'unpdf-pdfjs-1',reason:'parser_error'};
    if (totalPages>PDF_TEXT_MAX_PAGES) return {state:'unavailable',parser:'unpdf-pdfjs-1',reason:'page_limit_exceeded',totalPages};

    let text='';
    let truncated=false;
    let extractedPages=0;
    for (let pageNumber=1;pageNumber<=totalPages;pageNumber++) {
      const page=await pdf.getPage(pageNumber);
      const content=await page.getTextContent();
      const current=pageText(content);
      extractedPages++;
      if (!current) continue;
      const appended=appendBounded(text,(text?'\n\n':'')+current);
      text=appended.text;
      if (appended.truncated) { truncated=true; break; }
    }
    const normalized=text.trim();
    if (!normalized) return {state:'unavailable',parser:'unpdf-pdfjs-1',reason:'extraction_empty',totalPages};
    return {state:'extracted',parser:'unpdf-pdfjs-1',text:normalized,totalPages,extractedPages,characters:normalized.length,truncated};
  } catch {
    return {state:'unavailable',parser:'unpdf-pdfjs-1',reason:'parser_error'};
  } finally {
    try { await pdf?.destroy?.(); } catch {}
  }
}
