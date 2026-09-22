import type { AiFinancialScreenSnapshot } from './ai-financial.js';

const POT_SCREEN_HINT=/\b(cofrinhos?|caixinhas?|money\s*boxes?|savings\s*pots?|alcanc[ií]as?)\b/i;
const MONEY=/R\$\s*\d[\d.]*?(?:,\d{1,2})?(?=\s|$|[^\d.,])/gi;

function cleanLine(value:string){
  return value
    .normalize('NFKC')
    .replace(/[\t\u00a0]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function parseMoneyMinor(value:string):number|null{
  const raw=value.replace(/R\$/gi,'').replace(/\s+/g,'').trim();
  if(!raw) return null;
  let normalized=raw;
  if(raw.includes(',')) normalized=raw.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(raw)) normalized=raw.replace(/\./g,'');
  const amount=Number(normalized);
  if(!Number.isFinite(amount)||amount<0) return null;
  const minor=Math.round(amount*100);
  return Number.isSafeInteger(minor)&&minor<=1_000_000_000_000?minor:null;
}

function institutionFromText(text:string):string|null{
  const normalized=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  if(/mercado\s*pago|meli\+/.test(normalized)) return 'Mercado Pago';
  if(/\bnubank\b/.test(normalized)) return 'Nubank';
  if(/\bpicpay\b/.test(normalized)) return 'PicPay';
  if(/\bbanco inter\b|\binter\b/.test(normalized)) return 'Inter';
  if(/\bc6\s*bank\b/.test(normalized)) return 'C6 Bank';
  if(/\bitau\b/.test(normalized)) return 'Itaú';
  if(/\bbradesco\b/.test(normalized)) return 'Bradesco';
  if(/\bsantander\b/.test(normalized)) return 'Santander';
  return null;
}

function isCandidateName(value:string){
  const normalized=value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('pt-BR')
    .replace(/^[^a-z0-9]+/,'')
    .trim();

  if(normalized.length<2||normalized.length>80) return false;
  if(POT_SCREEN_HINT.test(normalized)) return false;
  if(/^(meta|saber mais|opcoes|opcao|aproveite|total|saldo|rendimento|rendimentos|cdi|meli\+)$/.test(normalized)) return false;
  if(/\b(cdi|saber mais|opcoes para voce|rendimento|rendimentos)\b/.test(normalized)) return false;
  if(/^r\$/.test(normalized)||/^\d+[,.]?\d*%/.test(normalized)) return false;
  return /[a-z0-9]/i.test(normalized);
}

function nameBeforeMoney(line:string,matchIndex:number){
  return cleanLine(line.slice(0,matchIndex).replace(/[·•|]+$/,''));
}

export function parseSavingsPotsFromOcr(text:string):AiFinancialScreenSnapshot|null{
  const normalizedText=String(text||'').normalize('NFKC');
  if(!POT_SCREEN_HINT.test(normalizedText)) return null;

  const lines=normalizedText.split(/\n+/).map(cleanLine).filter(Boolean);
  const institution=institutionFromText(normalizedText);
  const pots:Array<{name:string;balanceMinor:number;goalMinor:number|null;currency:'BRL';confidence:number}>=[];
  let pendingName:string|null=null;
  let lastPotIndex=-1;

  for(const line of lines){
    const meta=/\bmeta\s*:?\s*(R\$\s*\d[\d.]*?(?:,\d{1,2})?(?=\s|$|[^\d.,]))/i.exec(line);
    const metaGoalMinor=meta?parseMoneyMinor(meta[1]):null;
    const valueLine=meta?cleanLine(line.replace(meta[0],'')):line;
    const moneyMatches=[...valueLine.matchAll(MONEY)];

    if(!moneyMatches.length){
      if(metaGoalMinor!==null&&lastPotIndex>=0){
        pots[lastPotIndex]={...pots[lastPotIndex],goalMinor:metaGoalMinor};
      }else if(isCandidateName(valueLine)){
        pendingName=valueLine;
      }else if(POT_SCREEN_HINT.test(valueLine)){
        pendingName=null;
      }
      continue;
    }

    if(/\b(cdi|rendimento|rendimentos)\b/i.test(valueLine)||/%/.test(valueLine)){
      continue;
    }

    const first=moneyMatches[0];
    const balanceMinor=parseMoneyMinor(first[0]);
    if(balanceMinor===null) continue;

    let candidate=nameBeforeMoney(valueLine,first.index||0);
    if(!isCandidateName(candidate)) candidate=pendingName||'';
    if(!candidate||!isCandidateName(candidate)){
      continue;
    }

    const normalizedCandidate=candidate
      .replace(/^[^\p{L}\p{N}]+/u,'')
      .replace(/[·•|]+$/,'')
      .trim();

    const existingIndex=pots.findIndex(item=>
      item.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')===
      normalizedCandidate.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
    );

    const pot={
      name:normalizedCandidate.slice(0,80),
      balanceMinor,
      goalMinor:metaGoalMinor,
      currency:'BRL' as const,
      confidence:0.94
    };

    if(existingIndex>=0){
      pots[existingIndex]={
        ...pots[existingIndex],
        balanceMinor,
        goalMinor:metaGoalMinor??pots[existingIndex].goalMinor
      };
      lastPotIndex=existingIndex;
    }else{
      pots.push(pot);
      lastPotIndex=pots.length-1;
    }
    pendingName=null;
  }
  if(!pots.length) return null;

  return {
    screenType:'savings_pots',
    institution,
    accounts:[],
    pots,
    cards:[],
    commitments:[],
    movements:[],
    summary:`${pots.length} cofrinho${pots.length===1?'':'s'} identificado${pots.length===1?'':'s'}${institution?' em '+institution:''}.`
  };
}
