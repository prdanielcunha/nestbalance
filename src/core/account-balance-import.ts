import type { AiFinancialScreenSnapshot } from './ai-financial.js';

const BALANCE_LABEL=/\b(?:saldo(?:\s+dispon[ií]vel)?|dispon[ií]vel\s+agora|available\s+balance)\b/i;
const EXCLUDE_CONTEXT=/\b(?:limite|cart[aã]o|fatura|empr[eé]stimo|cr[eé]dito|investimento|cofrinho|reserva|meta)\b/i;

function cleanLine(value:string){
  return value.normalize('NFKC').replace(/[\t\u00a0]+/g,' ').replace(/\s+/g,' ').trim();
}

function parseBalanceToken(raw:string){
  const token=raw.replace(/R\$/gi,'').replace(/\s+/g,'').trim();
  if(!token||!/^\d[\d.,]*$/.test(token)) return null;

  // Brazilian banking UIs commonly render cents as superscript. OCR may join
  // "R$ 27" + superscript "24" into "R$ 2724". For a balance label, when
  // there is no decimal separator, preserve the final two digits as cents.
  if(!token.includes(',')&&!token.includes('.')){
    const digits=token.replace(/\D/g,'');
    if(digits.length>=3&&digits.length<=8){
      const amount=Number(digits.slice(0,-2))+Number(digits.slice(-2))/100;
      const minor=Math.round(amount*100);
      return Number.isSafeInteger(minor)?minor:null;
    }
  }

  let normalized=token;
  if(token.includes(',')) normalized=token.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(token)) normalized=token.replace(/\./g,'');
  const amount=Number(normalized);
  if(!Number.isFinite(amount)||amount<0) return null;
  const minor=Math.round(amount*100);
  return Number.isSafeInteger(minor)?minor:null;
}

function firstMoneyNear(lines:string[],labelIndex:number){
  for(let i=labelIndex;i<=Math.min(lines.length-1,labelIndex+3);i++){
    const line=lines[i];
    if(i!==labelIndex&&EXCLUDE_CONTEXT.test(line)) break;
    const match=/R\$\s*(\d[\d.,]*)/i.exec(line);
    if(!match) continue;
    const value=parseBalanceToken(match[0]);
    if(value!==null) return value;
  }
  return null;
}

export function parseAccountBalanceFromOcr(text:string):AiFinancialScreenSnapshot|null{
  const lines=String(text||'').split(/\n+/).map(cleanLine).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(!BALANCE_LABEL.test(lines[i])||EXCLUDE_CONTEXT.test(lines[i])) continue;
    const balanceMinor=firstMoneyNear(lines,i);
    if(balanceMinor===null) continue;
    return {
      screenType:'account_home',
      institution:null,
      accounts:[{
        name:'Saldo disponível',
        productType:'account',
        balanceMinor,
        currency:'BRL',
        confidence:0.97,
        last4:null
      }],
      pots:[],
      cards:[],
      commitments:[],
      movements:[],
      summary:'Saldo principal identificado pelo rótulo da tela.'
    };
  }
  return null;
}
