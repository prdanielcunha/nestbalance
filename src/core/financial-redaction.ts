export type RedactedFinancialText={
  text:string;
  redactionCount:number;
  truncated:boolean;
};

function keepLast4(value:string){
  const digits=value.replace(/\D/g,'');
  return digits.length>=4?`•••• ${digits.slice(-4)}`:'[CARD_REDACTED]';
}

export function redactFinancialText(input:unknown,maxChars=12000):RedactedFinancialText{
  let text=String(input??'').normalize('NFKC').replace(/\r\n?/g,'\n');
  let redactionCount=0;
  const replace=(pattern:RegExp,replacer:(match:string,...groups:string[])=>string)=>{
    text=text.replace(pattern,(match,...args)=>{
      redactionCount++;
      const groups=args.slice(0,-2) as string[];
      return replacer(match,...groups);
    });
  };

  replace(/\b(?:\d[ -]?){13,19}\b/g,(match)=>keepLast4(match));
  replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g,()=> '[CPF_REDACTED]');
  replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,()=> '[EMAIL_REDACTED]');
  replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/g,()=> '[PHONE_REDACTED]');
  replace(/\b(?:ag[eê]ncia|ag)\s*[:#-]?\s*\d{2,6}\b/gi,(match)=>match.replace(/\d/g,'•'));
  replace(/\b(?:conta(?:\s+corrente)?|c\/c)\s*[:#-]?\s*\d[\d.\-]{2,20}\b/gi,(match)=>match.replace(/\d/g,'•'));
  replace(/\bchave\s+pix\s*[:#-]?\s*[^\n]{3,120}/gi,()=> 'chave Pix: [PIX_KEY_REDACTED]');
  replace(/\b(?:titular|benefici[aá]rio|favorecido|nome\s+completo)\s*[:#-]\s*[^\n]{3,120}/gi,(match)=>{
    const label=match.split(/[:#-]/,1)[0];
    return `${label}: [NAME_REDACTED]`;
  });

  text=text
    .split('\n')
    .map(line=>line.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/[ \t]{2,}/g,' ')
    .trim();

  const truncated=text.length>maxChars;
  if(truncated) text=text.slice(0,maxChars);
  return {text,redactionCount,truncated};
}
