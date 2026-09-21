import OpenAI from 'openai';

let client:OpenAI|null=null;

export function isOpenAiConfigured(){
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAi(){
  if(!isOpenAiConfigured()) throw Object.assign(new Error('AI_NOT_CONFIGURED'),{statusCode:503});
  if(!client){
    client=new OpenAI({
      apiKey:process.env.OPENAI_API_KEY,
      timeout:25_000,
      maxRetries:1
    });
  }
  return client;
}

export const visionModel=()=>process.env.OPENAI_VISION_MODEL?.trim()||'gpt-5.6-luna';
export const transcriptionModel=()=>process.env.OPENAI_TRANSCRIBE_MODEL?.trim()||'gpt-transcribe';
