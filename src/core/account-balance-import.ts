import type { AiFinancialScreenSnapshot } from './ai-financial.js';

const BALANCE_LABEL=/\b(?:saldo(?:\s+dispon[ií]vel)?|dispon[ií]vel\s+agora|available\s+balance)\b/i;
const EXCLUDE_CONTEXT=/\b(?:limites?|cart[aã]o|cart[oõ]es|faturas?|empr[eé]stimos?|cr[eé]dito|investimentos?|cofrinhos?|reservas?|metas?|deposite|depositar|rendeu|rendimento|score|MUSD)\b/i;

export function accountInstitutionFromOcr(text:string):string|null{
  const plain=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  // Product names are useful even when the app only displays its logo.
  if(/\bmeli\s+dolar\b/i.test(plain)) return 'Mercado Pago';
  // Only use the account header; bank names in offers or transfers are not
  // evidence of the institution that owns the primary balance.
  const header=plain.split(/\bsaldo\b|\bavailable\s+balance\b/i)[0];
  const institutions=[
    ['Mercado Pago',/\bmercado\s*pago\b/i],
    ['Nubank',/\bnubank\b/i],['PicPay',/\bpicpay\b/i],
    ['Itaú',/\bitau\b/i],['Bradesco',/\bbradesco\b/i],
    ['Banco do Brasil',/\bbanco\s+do\s+brasil\b/i],
    ['Santander',/\bsantander\b/i],['Caixa',/\bcaixa\b/i]
  ] as const;
  const matches=institutions.filter(([,pattern])=>pattern.test(header));
  return matches.length===1?matches[0][0]:null;
}

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

  // Thousands separator + superscript cents can become "2.72400".
  // Read it as 2.724,00 instead of 2,724.
  if(!token.includes(',')&&/^\d{1,3}(?:\.\d{3})+\d{2}$/.test(token)){
    const digits=token.replace(/\D/g,'');
    const amount=Number(digits.slice(0,-2))+Number(digits.slice(-2))/100;
    const minor=Math.round(amount*100);
    return Number.isSafeInteger(minor)?minor:null;
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
    const match=/R\$\s*(\d[\d.,]*)(?:[ \t]+(\d{2})(?![\d.,%]))?/i.exec(line);
    if(!match) continue;
    let raw=match[0];
    // OCR can separate the raised cents by a space or a line break.
    if(match[2]&&!/[.,]/.test(match[1])) raw=`R$ ${match[1]},${match[2]}`;
    else if(!/[.,]/.test(match[1])&&/^\d{2}$/.test(lines[i+1]||'')){
      raw=`R$ ${match[1]},${lines[i+1]}`;
    }
    const value=parseBalanceToken(raw);
    if(value!==null) return value;
  }
  return null;
}

export function parseAccountBalanceFromOcr(text:string):AiFinancialScreenSnapshot|null{
  const lines=String(text||'').split(/\n+/).map(cleanLine).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(!BALANCE_LABEL.test(lines[i])) continue;
    // A tab bar may be one OCR line: "Saldo Cofrinhos Investimentos Cripto".
    const isTabBar=/^saldo(?:\s+cofrinhos)?(?:\s+investimentos)?(?:\s+cripto)?$/i.test(lines[i]);
    if(EXCLUDE_CONTEXT.test(lines[i])&&!isTabBar) continue;
    const balanceMinor=firstMoneyNear(lines,i);
    if(balanceMinor===null) continue;
    return {
      screenType:'account_home',
      institution:accountInstitutionFromOcr(text),
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

