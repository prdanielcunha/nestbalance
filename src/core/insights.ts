export type InsightTransaction={
  id:string;
  description:string;
  amountMinor:number;
  direction?:'expense'|'income'|'transfer';
  source?:string|null;
  status?:string;
  observedOn?:string|null;
};

export type SpendingCategory=
  |'housing'
  |'utilities'
  |'food'
  |'transport'
  |'health'
  |'subscriptions'
  |'shopping'
  |'education'
  |'other';

export type CategoryDelta={
  category:SpendingCategory;
  currentMinor:number;
  previousMinor:number;
  deltaMinor:number;
};

export type SpendingComparison={
  currentMonthKey:string;
  previousMonthKey:string;
  currentMinor:number;
  previousMinor:number;
  deltaMinor:number;
  currentCount:number;
  previousCount:number;
  hasComparableData:boolean;
  topIncreases:CategoryDelta[];
};

export type FinancialAnomaly={
  type:'amount_spike'|'possible_duplicate';
  transactionId:string;
  description:string;
  amountMinor:number;
  baselineMinor:number|null;
  differenceMinor:number|null;
  detail:string;
};

export type RecurringCandidate={
  key:string;
  description:string;
  averageMinor:number;
  observedMonths:number;
  monthKeys:string[];
};

const CATEGORY_PATTERNS:Array<[SpendingCategory,RegExp]>=[
  ['housing',/\b(aluguel|condominio|condomínio|iptu|imovel|imóvel|moradia)\b/i],
  ['utilities',/\b(luz|energia|agua|água|saneamento|internet|telefone|celular|gas|gás)\b/i],
  ['food',/\b(mercado|supermercado|atacadao|atacadão|ifood|restaurante|padaria|lanche|pizza|delivery)\b/i],
  ['transport',/\b(uber|99|combustivel|combustível|gasolina|etanol|estacionamento|pedagio|pedágio|onibus|ônibus)\b/i],
  ['health',/\b(farmacia|farmácia|medico|médico|consulta|hospital|clinica|clínica|laboratorio|laboratório|saude|saúde)\b/i],
  ['subscriptions',/\b(netflix|spotify|prime|disney|youtube|assinatura|icloud|google one|hbo|max)\b/i],
  ['shopping',/\b(amazon|magalu|shopee|mercado livre|loja|shopping)\b/i],
  ['education',/\b(escola|faculdade|curso|mensalidade escolar|material escolar|livro)\b/i]
];

function normalize(value:string){
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\b(?:pix|debito|deb|credito|cred|compra|pagamento|pgto|lancamento|lançamento)\b/g,' ')
    .replace(/\b\d{3,}\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function validExpense(row:InsightTransaction){
  return row.status!=='cancelled'&&row.direction==='expense'&&row.source!=='credit_card_invoice_payment'&&Number(row.amountMinor)>0;
}

function monthKeyAt(now:Date,offset:number){
  const year=now.getFullYear();
  const month=now.getMonth()+offset;
  const date=new Date(year,month,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function median(values:number[]){
  if(!values.length) return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:Math.round((sorted[middle-1]+sorted[middle])/2);
}

export function categorizeSpending(description:string):SpendingCategory{
  for(const [category,pattern] of CATEGORY_PATTERNS){
    if(pattern.test(description)) return category;
  }
  return 'other';
}

export function categoryLabel(category:SpendingCategory,locale:'pt-BR'|'en'|'es'='pt-BR'){
  const labels={
    'pt-BR':{
      housing:'Moradia',utilities:'Contas da casa',food:'Alimentação',transport:'Transporte',
      health:'Saúde',subscriptions:'Assinaturas',shopping:'Compras',education:'Educação',other:'Outros'
    },
    en:{
      housing:'Housing',utilities:'Household bills',food:'Food',transport:'Transport',
      health:'Health',subscriptions:'Subscriptions',shopping:'Shopping',education:'Education',other:'Other'
    },
    es:{
      housing:'Vivienda',utilities:'Cuentas del hogar',food:'Alimentación',transport:'Transporte',
      health:'Salud',subscriptions:'Suscripciones',shopping:'Compras',education:'Educación',other:'Otros'
    }
  } as const;
  return labels[locale][category];
}

export function deriveSpendingComparison(rows:InsightTransaction[],now:Date):SpendingComparison{
  const currentMonthKey=monthKeyAt(now,0);
  const previousMonthKey=monthKeyAt(now,-1);
  const expenses=rows.filter(validExpense);
  const current=expenses.filter(row=>String(row.observedOn||'').startsWith(currentMonthKey));
  const previous=expenses.filter(row=>String(row.observedOn||'').startsWith(previousMonthKey));

  const byCategory=(items:InsightTransaction[])=>{
    const map=new Map<SpendingCategory,number>();
    for(const item of items){
      const category=categorizeSpending(item.description);
      map.set(category,(map.get(category)||0)+Number(item.amountMinor||0));
    }
    return map;
  };

  const currentCategories=byCategory(current);
  const previousCategories=byCategory(previous);
  const categories=[...new Set([...currentCategories.keys(),...previousCategories.keys()])];
  const topIncreases=categories
    .map(category=>{
      const currentMinor=currentCategories.get(category)||0;
      const previousMinor=previousCategories.get(category)||0;
      return {category,currentMinor,previousMinor,deltaMinor:currentMinor-previousMinor};
    })
    .filter(item=>item.deltaMinor>0)
    .sort((a,b)=>b.deltaMinor-a.deltaMinor||b.currentMinor-a.currentMinor)
    .slice(0,5);

  const currentMinor=current.reduce((sum,item)=>sum+Number(item.amountMinor||0),0);
  const previousMinor=previous.reduce((sum,item)=>sum+Number(item.amountMinor||0),0);

  return {
    currentMonthKey,
    previousMonthKey,
    currentMinor,
    previousMinor,
    deltaMinor:currentMinor-previousMinor,
    currentCount:current.length,
    previousCount:previous.length,
    hasComparableData:previous.length>0,
    topIncreases
  };
}

export function deriveFinancialAnomalies(rows:InsightTransaction[],now:Date):FinancialAnomaly[]{
  const currentMonthKey=monthKeyAt(now,0);
  const expenses=rows.filter(validExpense);
  const current=expenses.filter(row=>String(row.observedOn||'').startsWith(currentMonthKey));
  const historical=expenses.filter(row=>row.observedOn&&!String(row.observedOn).startsWith(currentMonthKey));
  const anomalies:FinancialAnomaly[]=[];

  const duplicateGroups=new Map<string,InsightTransaction[]>();
  for(const row of current){
    const key=`${normalize(row.description)}|${row.amountMinor}|${row.observedOn||''}`;
    const group=duplicateGroups.get(key)||[];
    group.push(row);
    duplicateGroups.set(key,group);
  }
  for(const group of duplicateGroups.values()){
    if(group.length<2) continue;
    const row=group[0];
    anomalies.push({
      type:'possible_duplicate',
      transactionId:row.id,
      description:row.description,
      amountMinor:row.amountMinor,
      baselineMinor:null,
      differenceMinor:null,
      detail:`${group.length} lançamentos iguais no mesmo dia. Pode estar certo, mas vale conferir.`
    });
  }

  const historyByDescription=new Map<string,number[]>();
  for(const row of historical){
    const key=normalize(row.description);
    if(key.length<3) continue;
    const values=historyByDescription.get(key)||[];
    values.push(row.amountMinor);
    historyByDescription.set(key,values);
  }

  for(const row of current){
    const key=normalize(row.description);
    const values=historyByDescription.get(key)||[];
    if(values.length<2) continue;
    const baseline=median(values);
    const difference=row.amountMinor-baseline;
    if(baseline>0&&difference>=5000&&row.amountMinor>=Math.round(baseline*1.35)){
      anomalies.push({
        type:'amount_spike',
        transactionId:row.id,
        description:row.description,
        amountMinor:row.amountMinor,
        baselineMinor:baseline,
        differenceMinor:difference,
        detail:'Este valor ficou bem acima do histórico recente com a mesma descrição.'
      });
    }
  }

  return anomalies
    .sort((a,b)=>{
      if(a.type!==b.type) return a.type==='possible_duplicate'?-1:1;
      return (b.differenceMinor||b.amountMinor)-(a.differenceMinor||a.amountMinor);
    })
    .slice(0,8);
}

export function deriveRecurringCandidates(rows:InsightTransaction[]):RecurringCandidate[]{
  const expenses=rows.filter(validExpense).filter(row=>Boolean(row.observedOn));
  const groups=new Map<string,InsightTransaction[]>();
  for(const row of expenses){
    const key=normalize(row.description);
    if(key.length<3) continue;
    const group=groups.get(key)||[];
    group.push(row);
    groups.set(key,group);
  }

  const candidates:RecurringCandidate[]=[];
  for(const [key,items] of groups){
    const byMonth=new Map<string,InsightTransaction>();
    for(const item of items){
      const month=String(item.observedOn).slice(0,7);
      const current=byMonth.get(month);
      if(!current||item.amountMinor>current.amountMinor) byMonth.set(month,item);
    }
    if(byMonth.size<3) continue;
    const monthly=[...byMonth.values()].sort((a,b)=>String(a.observedOn).localeCompare(String(b.observedOn)));
    const amounts=monthly.map(item=>item.amountMinor);
    const baseline=median(amounts);
    if(!baseline) continue;
    const stable=amounts.filter(amount=>Math.abs(amount-baseline)<=baseline*0.25).length;
    if(stable/amounts.length<0.67) continue;
    candidates.push({
      key,
      description:monthly.at(-1)?.description||items[0].description,
      averageMinor:Math.round(amounts.reduce((sum,value)=>sum+value,0)/amounts.length),
      observedMonths:byMonth.size,
      monthKeys:[...byMonth.keys()].sort()
    });
  }

  return candidates.sort((a,b)=>b.observedMonths-a.observedMonths||b.averageMinor-a.averageMinor).slice(0,8);
}
