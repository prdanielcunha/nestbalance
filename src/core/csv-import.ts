import { parseFinancialText } from './text-parser';
import type { FinancialInterpretation } from './types';

export type CsvImportResult=
  |{state:'parsed';items:FinancialInterpretation[];delimiter:string;rowsRead:number}
  |{state:'unsupported';reason:string};

const normalizeHeader=(value:string)=>value
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();

function splitRow(row:string,delimiter:string){
  const cells:string[]=[];
  let current='';
  let quoted=false;
  for(let i=0;i<row.length;i++){
    const ch=row[i];
    if(ch==='"'){
      if(quoted&&row[i+1]==='"'){current+='"';i++;continue;}
      quoted=!quoted;continue;
    }
    if(ch===delimiter&&!quoted){cells.push(current.trim());current='';continue;}
    current+=ch;
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(header:string){
  const candidates=[';','\t',','];
  return candidates
    .map(delimiter=>({delimiter,count:splitRow(header,delimiter).length}))
    .sort((a,b)=>b.count-a.count)[0];
}

function findColumn(headers:string[],aliases:string[]){
  return headers.findIndex(header=>aliases.some(alias=>header===alias||header.includes(alias)));
}

function parseMoneyMinor(raw:string){
  let value=raw.trim().replace(/R\$/gi,'').replace(/\s/g,'');
  if(!value) return null;
  const explicitPlus=value.startsWith('+');
  const negative=value.startsWith('-');
  value=value.replace(/^[+-]/,'');
  if(!/^[\d.,]+$/.test(value)) return null;

  if(value.includes(',')){
    value=value.replace(/\./g,'').replace(',','.');
  }else{
    const pieces=value.split('.');
    if(pieces.length>2&&pieces.slice(1).every(piece=>piece.length===3)) value=pieces.join('');
  }
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<=0) return null;
  const minor=Math.round(amount*100);
  return Number.isSafeInteger(minor)?{minor,negative,explicitPlus}:null;
}

function parseDate(raw:string){
  const value=raw.trim();
  let match=value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if(match){
    const [,day,month,year]=match;
    const iso=`${year}-${month}-${day}`;
    const d=new Date(iso+'T12:00:00');
    return Number.isNaN(d.getTime())?null:iso;
  }
  match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(match){
    const d=new Date(value+'T12:00:00');
    return Number.isNaN(d.getTime())?null:value;
  }
  return null;
}

function directionFromType(raw:string){
  const value=normalizeHeader(raw);
  if(/receb|entrada|credito|credit|income/.test(value)) return 'income' as const;
  if(/pago|pagamento|saida|debito|debit|compra|expense/.test(value)) return 'expense' as const;
  if(/transfer/.test(value)) return 'transfer' as const;
  return null;
}

function sourceText(description:string,amountMinor:number,direction:'income'|'expense'|'transfer'|null){
  const amount=(amountMinor/100).toFixed(2).replace('.',',');
  const prefix=direction==='income'?'recebi':direction==='transfer'?'transferi':direction==='expense'?'paguei':'';
  return `${prefix} R$ ${amount} ${description}`.trim();
}

export function parseFinancialCsv(input:string):CsvImportResult{
  const lines=input.replace(/\r/g,'').split('\n').filter(line=>line.trim()).slice(0,501);
  if(lines.length<2) return {state:'unsupported',reason:'not_enough_rows'};

  const detected=detectDelimiter(lines[0]);
  if(!detected||detected.count<2) return {state:'unsupported',reason:'delimiter_not_found'};
  const delimiter=detected.delimiter;
  const headers=splitRow(lines[0],delimiter).map(normalizeHeader);

  const dateCol=findColumn(headers,['data','date']);
  const descriptionCol=findColumn(headers,['descricao','description','historico','detalhes','details','estabelecimento','merchant','lancamento']);
  const amountCol=findColumn(headers,['valor','amount']);
  const creditCol=findColumn(headers,['credito','credit','entrada','recebido']);
  const debitCol=findColumn(headers,['debito','debit','saida','pago']);
  const typeCol=findColumn(headers,['tipo','type','natureza','direction']);

  if(descriptionCol<0||(amountCol<0&&creditCol<0&&debitCol<0)){
    return {state:'unsupported',reason:'required_columns_not_found'};
  }

  const items:FinancialInterpretation[]=[];
  for(const line of lines.slice(1)){
    const cells=splitRow(line,delimiter);
    const description=String(cells[descriptionCol]||'').replace(/\s+/g,' ').trim().slice(0,120);
    if(description.length<2) continue;

    let amountMinor:number|null=null;
    let direction:'income'|'expense'|'transfer'|null=null;

    if(creditCol>=0){
      const credit=parseMoneyMinor(String(cells[creditCol]||''));
      if(credit){amountMinor=credit.minor;direction='income';}
    }
    if(amountMinor===null&&debitCol>=0){
      const debit=parseMoneyMinor(String(cells[debitCol]||''));
      if(debit){amountMinor=debit.minor;direction='expense';}
    }
    if(amountMinor===null&&amountCol>=0){
      const amount=parseMoneyMinor(String(cells[amountCol]||''));
      if(amount){
        amountMinor=amount.minor;
        if(amount.negative) direction='expense';
        else if(amount.explicitPlus) direction='income';
      }
    }
    if(amountMinor===null) continue;

    const typed=typeCol>=0?directionFromType(String(cells[typeCol]||'')):null;
    if(typed) direction=typed;

    const parsed=parseFinancialText(sourceText(description,amountMinor,direction));
    const occurredOn=dateCol>=0?parseDate(String(cells[dateCol]||'')):null;
    const needsReview=[
      ...parsed.needsReview.filter(item=>item!=='direction'),
      ...(!direction?['direction']:[]),
      ...(!occurredOn&&dateCol>=0?['date']:[])
    ];

    items.push({
      ...parsed,
      occurredOn:occurredOn||undefined,
      confidence:needsReview.length?'medium':'high',
      needsReview:[...new Set(needsReview)],
      fieldConfidence:{
        ...parsed.fieldConfidence,
        direction:direction?0.99:0,
        date:occurredOn?0.99:0
      }
    });
  }

  if(items.length<1) return {state:'unsupported',reason:'no_financial_rows'};
  return {state:'parsed',items,delimiter,rowsRead:lines.length-1};
}
