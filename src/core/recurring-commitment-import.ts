import type { AiFinancialScreenSnapshot } from './ai-financial.js';

const RECURRING_HINT=/\b(d[ée]bitos?\s+recorrentes?|contas?\s+(?:fixas|recorrentes)|pagamentos?\s+recorrentes?|despesas?\s+recorrentes?)\b/i;
const STOP_HINT=/^(?:vencimentos?|observa[cç][oõ]es?|anota[cç][oõ]es?|falta\s+do|total\s+geral)\b/i;

function cleanLine(value:string){
  return value.normalize('NFKC').replace(/[\t\u00a0]+/g,' ').replace(/\s+/g,' ').trim();
}

function moneyMinor(raw:string){
  let value=raw.replace(/R\$/gi,'').replace(/\s+/g,'').trim();
  if(!value||!/^\d[\d.,]*$/.test(value)) return null;
  if(value.includes(',')) value=value.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(value)) value=value.replace(/\./g,'');
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<=0) return null;
  const minor=Math.round(amount*100);
  return Number.isSafeInteger(minor)&&minor<=1_000_000_000_000?minor:null;
}

function cleanDescription(value:string){
  return value
    .normalize('NFKC')
    .replace(/^[^\p{L}\p{N}]+/u,'')
    .replace(/[|•·]+$/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,120);
}

function standaloneDay(line:string){
  return /^(?:[1-9]|[12]\d|3[01])$/.test(line)?Number(line):null;
}

function standaloneMoney(line:string){
  if(!/^(?:R\$\s*)?\d[\d.,]*$/.test(line)) return null;
  return moneyMinor(line);
}

function isDescriptionLine(line:string){
  return /\p{L}/u.test(line)&&
    !RECURRING_HINT.test(line)&&
    !STOP_HINT.test(line)&&
    !/^(?:d[ée]bito|descri[cç][aã]o|data|dia|vence|valor)$/i.test(line);
}

function rowFromLine(line:string){
  const full=/^(.{2,100}?)\s+([1-9]|[12]\d|3[01])\s+(?:R\$\s*)?(\d[\d.]*?(?:,\d{1,2})?)$/.exec(line);
  if(full){
    const amountMinor=moneyMinor(full[3]);
    const description=cleanDescription(full[1]);
    if(amountMinor&&description) return {description,amountMinor,dueDay:Number(full[2]),confidence:0.97};
  }
  const withoutDay=/^(.{2,100}?)\s+(?:R\$\s*)?(\d[\d.]*?(?:,\d{1,2})?)$/.exec(line);
  if(withoutDay){
    const amountMinor=moneyMinor(withoutDay[2]);
    const description=cleanDescription(withoutDay[1]);
    if(amountMinor&&description&&!/^(?:d[ée]bito|data|valor)$/i.test(description)) return {description,amountMinor,dueDay:null,confidence:0.90};
  }
  return null;
}

export function parseRecurringCommitmentsFromOcr(text:string):AiFinancialScreenSnapshot|null{
  const source=String(text||'').normalize('NFKC');
  if(!RECURRING_HINT.test(source)) return null;
  const lines=source.split(/\n+/).map(cleanLine).filter(Boolean);
  const start=Math.max(0,lines.findIndex(line=>RECURRING_HINT.test(line)));
  const commitments:AiFinancialScreenSnapshot['commitments']=[];

  for(let i=start+1;i<lines.length;i++){
    const line=lines[i];
    if(STOP_HINT.test(line)) break;
    if(/^(?:d[ée]bito|descri[cç][aã]o)\s+(?:data|dia|vence)\s+valor$/i.test(line)) continue;
    if(/^(?:d[ée]bito|descri[cç][aã]o|data|dia|vence|valor)$/i.test(line)) continue;

    let row=rowFromLine(line);

    // Mobile-note screenshots and some OCR engines return table cells as
    // separate lines instead of keeping a row together: name -> day -> value.
    if(!row&&isDescriptionLine(line)){
      const next=lines[i+1]||'';
      const after=lines[i+2]||'';
      const dueDay=standaloneDay(next);
      const amountWithDay=dueDay!==null?standaloneMoney(after):null;
      if(dueDay!==null&&amountWithDay!==null){
        row={description:cleanDescription(line),amountMinor:amountWithDay,dueDay,confidence:0.96};
        i+=2;
      }else{
        const amountOnly=standaloneMoney(next);
        if(amountOnly!==null){
          row={description:cleanDescription(line),amountMinor:amountOnly,dueDay:null,confidence:0.90};
          i+=1;
        }
      }
    }

    if(!row) continue;
    commitments.push({
      description:row.description,
      amountMinor:row.amountMinor,
      dueOn:null,
      dueDay:row.dueDay,
      recurring:true,
      installment:null,
      confidence:row.confidence,
      needsReview:false
    });
  }

  if(commitments.length<2) return null;
  return {
    screenType:'other',
    institution:null,
    accounts:[],
    pots:[],
    cards:[],
    commitments,
    movements:[],
    summary:`${commitments.length} contas recorrentes identificadas.`
  };
}
