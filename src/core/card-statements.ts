export type StatementInstallment={current:number;total:number};

export type CreditCardStatementItem={
  key:string;
  lineNumber:number;
  description:string;
  amountMinor:number;
  observedOn:string|null;
  installment:StatementInstallment|null;
  confidence:'high'|'medium';
  needsReview:string[];
  sourceLine:string;
};

export type StatementProjectionMonth={
  dueOn:string;
  totalMinor:number;
  itemCount:number;
  installmentCount:number;
};

export type CreditCardStatementPreview={
  statementDueOn:string;
  items:CreditCardStatementItem[];
  currentInvoiceMinor:number;
  projectedMonths:StatementProjectionMonth[];
  ignoredLineCount:number;
};

const summaryPattern=/\b(total\s+(?:da\s+)?fatura|pagamento\s+(?:recebido|efetuado)|saldo\s+anterior|limite\s+(?:dispon[ií]vel|total)|melhor\s+dia\s+de\s+compra|vencimento\s+da\s+fatura)\b/i;
const installmentPattern=/\b(?:parc(?:ela)?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i;

function parseBrlMinor(raw:string):number|null{
  let text=raw.replace(/R\$/gi,'').replace(/\s+/g,'').trim();
  const negative=text.startsWith('-');
  if(negative) text=text.slice(1);
  if(!text) return null;

  let normalized=text;
  if(text.includes(',')){
    normalized=text.replace(/\./g,'').replace(',','.');
  }else if(/^\d{1,3}(?:\.\d{3})+$/.test(text)){
    normalized=text.replace(/\./g,'');
  }

  const value=Number(normalized);
  if(!Number.isFinite(value)||value<0) return null;
  const minor=Math.round(value*100)*(negative?-1:1);
  return Number.isSafeInteger(minor)?minor:null;
}

function validIso(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts=value.split('-').map(Number);
  const date=new Date(parts[0],parts[1]-1,parts[2]);
  return date.getFullYear()===parts[0]&&date.getMonth()===parts[1]-1&&date.getDate()===parts[2];
}

function iso(year:number,month:number,day:number){
  const maxDay=new Date(year,month,0).getDate();
  const safeDay=Math.min(day,maxDay);
  return [String(year).padStart(4,'0'),String(month).padStart(2,'0'),String(safeDay).padStart(2,'0')].join('-');
}

function inferObservedOn(day:number,month:number,explicitYear:number|null,statementDueOn:string){
  if(explicitYear!==null){
    const value=iso(explicitYear,month,day);
    return validIso(value)?value:null;
  }

  const due=statementDueOn.split('-').map(Number);
  let year=due[0];
  if(month>due[1]) year-=1;
  const value=iso(year,month,day);
  return validIso(value)?value:null;
}

function stableKey(input:string){
  let hash=2166136261;
  for(let i=0;i<input.length;i++){
    hash^=input.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}

function parseDatePrefix(line:string,statementDueOn:string){
  const full=line.match(/^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if(full){
    const day=Number(full[1]),month=Number(full[2]);
    let year=Number(full[3]);
    if(year<100) year+=2000;
    const observedOn=inferObservedOn(day,month,year,statementDueOn);
    return {observedOn,raw:full[0],yearInferred:false};
  }

  const short=line.match(/^\s*(\d{1,2})[\/.\-](\d{1,2})\b/);
  if(short){
    const day=Number(short[1]),month=Number(short[2]);
    const observedOn=inferObservedOn(day,month,null,statementDueOn);
    return {observedOn,raw:short[0],yearInferred:true};
  }

  return {observedOn:null,raw:'',yearInferred:false};
}

function parseAmountSuffix(line:string){
  const match=line.match(/(-?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|-?\s*(?:R\$\s*)?\d+(?:[.,]\d{1,2}))\s*$/i);
  if(!match) return null;
  const amountMinor=parseBrlMinor(match[1]);
  if(amountMinor===null) return null;
  return {amountMinor,raw:match[0]};
}

function cleanDescription(line:string,dateRaw:string,amountRaw:string){
  let text=line;
  if(dateRaw) text=text.slice(dateRaw.length);
  if(amountRaw) text=text.slice(0,Math.max(0,text.length-amountRaw.length));
  text=text.replace(installmentPattern,' ');
  text=text.replace(/\bparc(?:ela)?\b/gi,' ');
  text=text.replace(/[|·]+/g,' ');
  text=text.replace(/\s+/g,' ').trim();
  return text.slice(0,120);
}

function monthAdd(dateIso:string,offset:number){
  const parts=dateIso.split('-').map(Number);
  const sourceDay=parts[2];
  const d=new Date(parts[0],parts[1]-1+offset,1);
  return iso(d.getFullYear(),d.getMonth()+1,sourceDay);
}

export function parseCreditCardStatement(text:string,statementDueOn:string):CreditCardStatementPreview{
  if(!validIso(statementDueOn)) throw new Error('INVALID_STATEMENT_DUE_ON');

  const lines=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const items:CreditCardStatementItem[]=[];
  let ignoredLineCount=0;

  for(let index=0;index<lines.length&&items.length<120;index++){
    const sourceLine=lines[index].replace(/\s+/g,' ').trim();
    if(!sourceLine||sourceLine.length<4||summaryPattern.test(sourceLine)){
      ignoredLineCount++;
      continue;
    }

    const amount=parseAmountSuffix(sourceLine);
    if(!amount||amount.amountMinor===0){
      ignoredLineCount++;
      continue;
    }

    const date=parseDatePrefix(sourceLine,statementDueOn);
    const installmentMatch=sourceLine.match(installmentPattern);
    let installment:StatementInstallment|null=null;
    if(installmentMatch){
      const current=Number(installmentMatch[1]),total=Number(installmentMatch[2]);
      if(current>=1&&total>=current&&total<=120) installment={current,total};
    }

    const description=cleanDescription(sourceLine,date.raw,amount.raw);
    if(description.length<2||summaryPattern.test(description)){
      ignoredLineCount++;
      continue;
    }

    const needsReview:string[]=[];
    if(!date.observedOn) needsReview.push('purchase_date');
    else if(date.yearInferred) needsReview.push('purchase_year_inferred');
    if(!installment&&/\bparc/i.test(sourceLine)) needsReview.push('installment');

    const key=stableKey([
      index+1,
      date.observedOn||'',
      description.toLocaleLowerCase('pt-BR'),
      amount.amountMinor,
      installment?String(installment.current)+'/'+String(installment.total):''
    ].join('|'));

    items.push({
      key,
      lineNumber:index+1,
      description,
      amountMinor:amount.amountMinor,
      observedOn:date.observedOn,
      installment,
      confidence:needsReview.length?'medium':'high',
      needsReview,
      sourceLine:sourceLine.slice(0,280)
    });
  }

  const monthMap=new Map<string,StatementProjectionMonth>();
  for(const item of items){
    const remaining=item.installment?item.installment.total-item.installment.current+1:1;
    for(let offset=0;offset<remaining;offset++){
      const dueOn=monthAdd(statementDueOn,offset);
      const existing=monthMap.get(dueOn)||{dueOn,totalMinor:0,itemCount:0,installmentCount:0};
      existing.totalMinor+=item.amountMinor;
      existing.itemCount+=1;
      if(item.installment) existing.installmentCount+=1;
      monthMap.set(dueOn,existing);
    }
  }

  const projectedMonths=[...monthMap.values()].sort((a,b)=>a.dueOn.localeCompare(b.dueOn));
  return {
    statementDueOn,
    items,
    currentInvoiceMinor:projectedMonths[0]?.totalMinor||0,
    projectedMonths,
    ignoredLineCount
  };
}
