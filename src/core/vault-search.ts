export type VaultSearchSignal={
  kind?:string;
  raw?:string;
  normalized?:string;
  context?:string;
  amountMinor?:number;
};

export type VaultSearchDocument={
  evidenceId:string;
  originalName:string;
  createdAtMs:number|null;
  description?:string|null;
  merchant?:string|null;
  payer?:string|null;
  payee?:string|null;
  institution?:string|null;
  amountMinor?:number|null;
  dateIso?:string|null;
  transcript?:string|null;
  rawText?:string|null;
  summary?:string|null;
  signals?:VaultSearchSignal[];
};

export type VaultSearchHit={
  evidenceId:string;
  score:number;
  reason:string;
};

const STOPWORDS=new Set(['a','as','o','os','de','da','das','do','dos','e','em','no','na','nos','nas','um','uma','meu','minha','meus','minhas','comprovante','pagamento','documento','arquivo']);

const SYNONYMS:Record<string,string[]>={
  luz:['energia','eletrica','eletricidade'],
  energia:['luz','eletrica','eletricidade'],
  agua:['saneamento','sabesp'],
  internet:['fibra','banda','telefone'],
  carro:['veiculo','automovel'],
  veiculo:['carro','automovel'],
  pix:['transferencia','e2e'],
  boleto:['conta','cobranca'],
  fatura:['cartao','invoice'],
  aluguel:['locacao'],
  mercado:['supermercado'],
  iptu:['imovel','prefeitura']
};

const MONTHS=[
  ['janeiro','jan'],['fevereiro','fev'],['marco','mar'],['abril','abr'],['maio','mai'],['junho','jun'],
  ['julho','jul'],['agosto','ago'],['setembro','set'],['outubro','out'],['novembro','nov'],['dezembro','dez']
];

function normalize(value:unknown){
  return String(value??'')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function tokens(value:string){
  return normalize(value).split(' ').filter(token=>token.length>=2&&!STOPWORDS.has(token));
}

function monthAliases(ms:number|null,dateIso?:string|null){
  let monthIndex:number|null=null;
  if(dateIso&&/^\d{4}-\d{2}-\d{2}$/.test(dateIso)){
    const month=Number(dateIso.slice(5,7));
    if(month>=1&&month<=12) monthIndex=month-1;
  }
  if(monthIndex===null&&Number.isFinite(ms)){
    const date=new Date(Number(ms));
    if(!Number.isNaN(date.getTime())) monthIndex=date.getMonth();
  }
  return monthIndex===null?'':MONTHS[monthIndex].join(' ');
}

function moneyAliases(amountMinor:number|null|undefined){
  if(!Number.isSafeInteger(amountMinor)||amountMinor!<=0) return '';
  const major=amountMinor!/100;
  const fixed=major.toFixed(2);
  const br=fixed.replace('.',',');
  return normalize([String(major),fixed,br,`r$ ${br}`,String(amountMinor)].join(' '));
}

function tokenMatches(token:string,field:string){
  if(!field) return false;
  if(field.includes(token)) return true;
  return (SYNONYMS[token]||[]).some(alias=>field.includes(normalize(alias)));
}

function reasonFor(doc:VaultSearchDocument){
  const parts:string[]=[];
  if(doc.description) parts.push(String(doc.description).slice(0,80));
  else if(doc.merchant) parts.push(String(doc.merchant).slice(0,80));
  else if(doc.institution) parts.push(String(doc.institution).slice(0,80));
  if(Number.isSafeInteger(doc.amountMinor)&&doc.amountMinor!>0){
    parts.push(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(doc.amountMinor!/100));
  }
  const month=monthAliases(doc.createdAtMs,doc.dateIso).split(' ')[0];
  if(month) parts.push(month.charAt(0).toUpperCase()+month.slice(1));
  return parts.join(' · ')||'Conteúdo do documento';
}

export function searchVaultDocuments(query:string,documents:VaultSearchDocument[],limit=20):VaultSearchHit[]{
  const queryTokens=tokens(query).slice(0,8);
  if(!queryTokens.length) return [];

  const max=Math.max(1,Math.min(Math.trunc(limit)||20,50));
  const hits:VaultSearchHit[]=[];

  for(const doc of documents){
    const signals=(doc.signals||[]).slice(0,120);
    const fields=[
      {weight:10,text:normalize(doc.description)},
      {weight:9,text:normalize(doc.merchant)},
      {weight:8,text:normalize(doc.payee)},
      {weight:7,text:normalize(doc.payer)},
      {weight:7,text:normalize(doc.institution)},
      {weight:6,text:normalize(doc.originalName)},
      {weight:6,text:moneyAliases(doc.amountMinor)},
      {weight:5,text:monthAliases(doc.createdAtMs,doc.dateIso)},
      {weight:4,text:normalize(doc.summary)},
      {weight:3,text:normalize(signals.map(signal=>[signal.raw,signal.normalized,signal.context,signal.amountMinor].filter(Boolean).join(' ')).join(' '))},
      {weight:2,text:normalize(doc.transcript)},
      {weight:1,text:normalize(doc.rawText).slice(0,20000)}
    ];

    let score=0;
    let matched=0;
    for(const token of queryTokens){
      let best=0;
      for(const field of fields){
        if(tokenMatches(token,field.text)) best=Math.max(best,field.weight);
      }
      if(best>0){
        matched++;
        score+=best;
      }
    }

    const coverage=matched/queryTokens.length;
    if(matched===0||coverage<0.5) continue;
    score+=Math.round(coverage*10);
    if(coverage===1) score+=8;

    hits.push({evidenceId:doc.evidenceId,score,reason:reasonFor(doc)});
  }

  return hits.sort((a,b)=>b.score-a.score||a.evidenceId.localeCompare(b.evidenceId)).slice(0,max);
}
