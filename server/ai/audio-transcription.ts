import { getOpenAi, transcriptionModel } from './openai-client.js';

export const AI_AUDIO_MAX_BYTES=10*1024*1024;
export const AI_TRANSCRIPT_MAX_CHARACTERS=12_000;

export async function transcribeFinancialAudio(bytes:Buffer,mimeType:string,fileName:string){
  if(!mimeType.startsWith('audio/')) throw Object.assign(new Error('AI_AUDIO_TYPE_REQUIRED'),{statusCode:400});
  if(bytes.length<=0||bytes.length>AI_AUDIO_MAX_BYTES) throw Object.assign(new Error('AI_AUDIO_TOO_LARGE'),{statusCode:400});

  const model=transcriptionModel();
  const file=new File([new Uint8Array(bytes)],fileName||'audio',{type:mimeType});
  const response=await getOpenAi().audio.transcriptions.create({
    model,
    file,
    prompt:'Transcreva fielmente em português quando possível. Contexto: finanças pessoais; valores em reais, Pix, boletos, contas, parcelas, compras, pagamentos e recebimentos. Não resuma e não invente.'
  });
  const source=String(response.text||'').replace(/\u0000/g,'').trim();
  if(!source) throw new Error('AI_EMPTY_TRANSCRIPT');
  const truncated=source.length>AI_TRANSCRIPT_MAX_CHARACTERS;
  const transcript=source.slice(0,AI_TRANSCRIPT_MAX_CHARACTERS);
  return {model,transcript,truncated,characters:transcript.length};
}
