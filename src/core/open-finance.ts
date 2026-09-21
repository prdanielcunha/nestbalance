export type OpenFinanceInstitutionKey='mercado_pago'|'nubank'|'itau'|'santander'|'other';

export type OpenFinanceCapability=
  |'accounts'
  |'balances'
  |'transactions'
  |'credit_cards'
  |'bills'
  |'investments';

export type OpenFinanceInstitution={
  key:OpenFinanceInstitutionKey;
  name:string;
  priority:number;
  belvoInstitution?:string;
  capabilities:OpenFinanceCapability[];
  note?:string;
};

export const OPEN_FINANCE_INSTITUTIONS:OpenFinanceInstitution[]=[
  {
    key:'mercado_pago',
    name:'Mercado Pago',
    priority:1,
    belvoInstitution:'ofmercadopago_br_retail',
    capabilities:['accounts','balances','transactions','credit_cards','bills','investments'],
    note:'Prioridade do NestBalance. Cofrinhos só aparecem quando a fonte autorizada os expõe como conta ou investimento.'
  },
  {
    key:'nubank',
    name:'Nubank',
    priority:2,
    belvoInstitution:'ofnubank_br_retail',
    capabilities:['accounts','balances','transactions','credit_cards','bills','investments']
  },
  {
    key:'itau',
    name:'Itaú',
    priority:3,
    belvoInstitution:'ofitau_br_retail',
    capabilities:['accounts','balances','transactions','credit_cards','bills','investments']
  },
  {
    key:'santander',
    name:'Santander',
    priority:4,
    belvoInstitution:'ofsantander_br_retail',
    capabilities:['accounts','balances','transactions','credit_cards','bills','investments']
  },
  {
    key:'other',
    name:'Outro banco',
    priority:99,
    capabilities:['accounts','balances','transactions','credit_cards','bills','investments']
  }
];

export function normalizeCpf(value:unknown){
  return String(value??'').replace(/\D/g,'');
}

export function isValidCpf(value:unknown){
  const cpf=normalizeCpf(value);
  if(!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf)) return false;

  const digit=(length:number)=>{
    let sum=0;
    for(let index=0;index<length;index++){
      sum+=Number(cpf[index])*(length+1-index);
    }
    const remainder=(sum*10)%11;
    return remainder===10?0:remainder;
  };

  return digit(9)===Number(cpf[9])&&digit(10)===Number(cpf[10]);
}

export function normalizeLegalName(value:unknown){
  return String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,120);
}

export function isSafeOpenFinanceOrigin(value:unknown){
  try{
    const url=new URL(String(value??''));
    if(url.protocol!=='https:') return false;
    return [
      'nestbalance.millionsnest.com',
      'mn-nestbalance-555464791734.web.app',
      'mn-nb-prod-555464791734.web.app',
      'mn-nb-homol-555464791734.web.app'
    ].includes(url.hostname)&&url.pathname==='/';
  }catch{
    return false;
  }
}

export function institutionFor(key:unknown){
  return OPEN_FINANCE_INSTITUTIONS.find(item=>item.key===key)??OPEN_FINANCE_INSTITUTIONS.at(-1)!;
}

export function mapBelvoAccountType(category:unknown){
  const value=String(category??'').toUpperCase();
  if(value==='CREDIT_CARD') return 'credit_card';
  if(value==='INVESTMENT_ACCOUNT'||value==='PENSION_FUND_ACCOUNT') return 'investment';
  if(value==='CHECKING_ACCOUNT'||value==='SAVINGS_ACCOUNT'||value==='ADVANCE_DEPOSIT_ACCOUNT') return 'bank';
  if(value.includes('LOAN')||value.includes('FINANC')) return 'liability';
  return 'bank';
}

export function decimalToMinor(value:unknown){
  const amount=Number(value);
  if(!Number.isFinite(amount)) return null;
  const minor=Math.round(amount*100);
  return Number.isSafeInteger(minor)?minor:null;
}
