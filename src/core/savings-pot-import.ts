import type { AiFinancialScreenSnapshot } from './ai-financial.js';

const OCR_ICON_PREFIXES=new Set(['t','v','vv','vc','vy','vw','w','ww','e','i','ii','l','ll','c','y','iv','vi']);
const OCR_PREFIX_WORD_ALLOWLIST=new Set(['a','o','as','os','um','em','de','da','do','no','na','tv']);

function cleanSavingsPotDisplayName(value:string,inferredPrefixes:Set<string>=new Set()){
  let clean=String(value||'')
    .normalize('NFKC')
    .replace(/^[^\p{L}\p{N}]+/u,'')
    .replace(/[|•·]+$/g,'')
    .replace(/\s+/g,' ')
    .trim();
  const parts=clean.split(' ').filter(Boolean);
  const prefix=parts[0]?.toLocaleLowerCase('pt-BR')||'';
  if(parts.length>=2&&(OCR_ICON_PREFIXES.has(prefix)||inferredPrefixes.has(prefix))){
    clean=parts.slice(1).join(' ');
  }
  return clean.slice(0,120);
}

const POT_SCREEN_HINT=/\b(cofrinhos?|caixinhas?|money\s*boxes?|savings\s*pots?|alcanc[ií]as?)\b/i;
const MONEY=/R\$\s*\d(?:[\d.\u00a0 ]*\d)?(?:,\d{1,2})?(?=\s|$|[^\d.,])/gi;
const EXPLICIT_DATE=/\b(?:prazo|ate|até|objetivo|data)\s*:?\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/i;

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

function normalizedCopy(value:string){
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
}

function isSavingsPotProgressCopy(value:string){
  const normalized=normalizedCopy(value);
  return /\b(falta|faltam|resta|restam|faltan|restan)\b.*\b(meta|objetivo)\b/.test(normalized)
    || /\b(left|remaining)\b.*\b(goal|target)\b/.test(normalized)
    || /\bpara\s+(?:atingir|alcancar|chegar\s+(?:na|a))\s+(?:a\s+)?(?:meta|objetivo)\b/.test(normalized);
}

function inferRepeatedOcrPrefixes(lines:string[]){
  const counts=new Map<string,number>();
  for(const line of lines){
    if(isSavingsPotProgressCopy(line)||POT_SCREEN_HINT.test(line)||/\b(meta|saldo|total|rendimento|rendimentos|cdi)\b/i.test(line)) continue;
    const money=[...line.matchAll(MONEY)][0];
    const candidate=money?nameBeforeMoney(line,money.index||0):line;
    const parts=cleanLine(candidate).replace(/^[^\p{L}\p{N}]+/u,'').split(' ').filter(Boolean);
    if(parts.length<2) continue;
    const prefix=parts[0].toLocaleLowerCase('pt-BR');
    if(prefix.length>2||OCR_PREFIX_WORD_ALLOWLIST.has(prefix)||OCR_ICON_PREFIXES.has(prefix)||!/^[a-z]+$/i.test(prefix)) continue;
    counts.set(prefix,(counts.get(prefix)||0)+1);
  }
  return new Set([...counts.entries()].filter(([,count])=>count>=2).map(([prefix])=>prefix));
}

function parseTargetDate(line:string){
  const match=EXPLICIT_DATE.exec(line);
  if(!match) return null;
  const day=Number(match[1]);
  const month=Number(match[2]);
  const year=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day) return null;
  return `${year.toString().padStart(4,'0')}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
}

export function parseSavingsPotsFromOcr(text:string):AiFinancialScreenSnapshot|null{
  const normalizedText=String(text||'').normalize('NFKC');
  if(!POT_SCREEN_HINT.test(normalizedText)) return null;

  const lines=normalizedText.split(/\n+/).map(cleanLine).filter(Boolean);
  const institution=institutionFromText(normalizedText);
  const inferredOcrPrefixes=inferRepeatedOcrPrefixes(lines);
  const pots:Array<{name:string;balanceMinor:number;goalMinor:number|null;targetDate:string|null;currency:'BRL';confidence:number}>=[];
  let pendingName:string|null=null;
  let lastPotIndex=-1;

  for(const line of lines){
    if(isSavingsPotProgressCopy(line)) continue;
    const meta=/\bmeta\s*:?\s*(R\$\s*\d(?:[\d.\u00a0 ]*\d)?(?:,\d{1,2})?(?=\s|$|[^\d.,]))/i.exec(line);
    const metaGoalMinor=meta?parseMoneyMinor(meta[1]):null;
    const targetDate=parseTargetDate(line);
    let valueLine=meta?cleanLine(line.replace(meta[0],'')):line;
    const explicitDate=EXPLICIT_DATE.exec(valueLine);
    if(explicitDate) valueLine=cleanLine(valueLine.replace(explicitDate[0],''));
    const moneyMatches=[...valueLine.matchAll(MONEY)];

    if(!moneyMatches.length){
      if((metaGoalMinor!==null||targetDate)&&lastPotIndex>=0){
        pots[lastPotIndex]={
          ...pots[lastPotIndex],
          goalMinor:metaGoalMinor??pots[lastPotIndex].goalMinor,
          targetDate:targetDate??pots[lastPotIndex].targetDate
        };
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

    const normalizedCandidate=cleanSavingsPotDisplayName(candidate,inferredOcrPrefixes);

    const existingIndex=pots.findIndex(item=>
      item.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')===
      normalizedCandidate.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
    );

    const pot={
      name:normalizedCandidate.slice(0,80),
      balanceMinor,
      goalMinor:metaGoalMinor,
      targetDate,
      currency:'BRL' as const,
      confidence:0.94
    };

    if(existingIndex>=0){
      pots[existingIndex]={
        ...pots[existingIndex],
        balanceMinor,
        goalMinor:metaGoalMinor??pots[existingIndex].goalMinor,
        targetDate:targetDate??pots[existingIndex].targetDate
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
