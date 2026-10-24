import type { AiFinancialDirection, AiFinancialScreenSnapshot } from './ai-financial.js';
import { parseAccountBalanceFromOcr, accountInstitutionFromOcr } from './account-balance-import';
import { detectDocumentSignals } from './document-signals';
import { parseRecurringCommitmentsFromOcr } from './recurring-commitment-import';
import { parseSavingsPotsFromOcr } from './savings-pot-import';

export type FinancialScreenshotKind=AiFinancialScreenSnapshot['screenType']|'bill';
export type FinancialScreenshotResult={
  kind:FinancialScreenshotKind;
  screen:AiFinancialScreenSnapshot|null;
  needsReview:boolean;
  reason:'recognized'|'missing_amount'|'ambiguous'|'unrecognized';
};
const plain=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const OFFER=/\b(?:deposite|depositar|emprestimos?|contratar|saiba|saber mais|oferta|cashback|score|rendimento|cdi|limite|saldo)\b/i;
const MONEY=/R\$\s*\d[\d.]*(?:,\d{1,2})?/gi;

function amounts(line:string){
  return detectDocumentSignals(line).candidates.filter(x=>x.kind==='money'&&x.amountMinor!==undefined).map(x=>x.amountMinor!);
}
function labeledAmount(lines:string[],label:RegExp){
  for(let i=0;i<lines.length;i++){
    if(!label.test(plain(lines[i]))) continue;
    const same=amounts(lines[i]);
    if(same.length===1) return same[0];
    // Accept the following line only when it is exclusively a currency value.
    if(/^R\$\s*\d[\d.,]*$/i.test(lines[i+1]||'')) return amounts(lines[i+1])[0]??null;
  }
  return null;
}
function direction(line:string):AiFinancialDirection{
  const value=plain(line);
  const income=/\b(?:recebido|recebida|recebi|entrada|credito recebido)\b/.test(value);
  const expense=/\b(?:enviado|enviada|pago|paga|pagamento realizado|compra aprovada|saida)\b/.test(value);
  if(income&&expense) return 'unknown';
  if(/\b(?:entre (?:minhas|suas|proprias) contas|conta propria)\b/.test(value)) return 'transfer';
  return income?'income':expense?'expense':'unknown';
}
function snapshot(kind:AiFinancialScreenSnapshot['screenType'],text:string):AiFinancialScreenSnapshot{
  return {screenType:kind,institution:accountInstitutionFromOcr(text),accounts:[],pots:[],cards:[],commitments:[],movements:[],summary:'Dados reconhecidos no texto do print; confira antes de guardar.'};
}
function result(kind:FinancialScreenshotKind,screen:AiFinancialScreenSnapshot|null,reason:FinancialScreenshotResult['reason']='recognized'):FinancialScreenshotResult{
  return {kind,screen,needsReview:true,reason};
}
function dateIn(text:string){
  return detectDocumentSignals(text).candidates.find(x=>x.kind==='date')?.normalized??null;
}
function historyMovements(lines:string[],start:number){
  const movements:AiFinancialScreenSnapshot['movements']=[];
  let date:string|null=null;
  for(const line of lines.slice(start+1)){
    const value=plain(line);
    date=dateIn(line)??date;
    if(OFFER.test(value)) continue;
    const values=amounts(line);
    if(values.length!==1||values[0]<=0) continue;
    // Require a movement verb or a date plus a visible +/- sign. A number alone
    // never establishes a transaction, even inside a history screen.
    const explicit=direction(line);
    const sign=/([+-])\s*R\$/i.exec(line)?.[1];
    if(explicit==='unknown'&&!(date&&sign)) continue;
    const resolved=explicit!=='unknown'?explicit:sign==='+'?'income':'expense';
    const description=line.replace(MONEY,'').replace(/\b\d{2}[/-]\d{2}[/-]\d{4}\b/g,'').replace(/[+-]\s*$/,'').trim();
    if(description.length<2) continue;
    movements.push({description:description.slice(0,120),amountMinor:values[0],direction:resolved,dateIso:date,confidence:0.9,needsReview:true,visibleText:line.slice(0,220)});
  }
  return movements;
}

/** Classify before extracting. Every output is a proposal, never a financial write. */
export function classifyFinancialScreenshot(input:string):FinancialScreenshotResult{
  const text=String(input||'').slice(0,100_000).normalize('NFKC');
  const lines=text.split(/\r?\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const normalized=plain(text);
  if(!text.trim()) return result('other',null,'unrecognized');

  const recurring=parseRecurringCommitmentsFromOcr(text);
  if(recurring) return result('mixed',recurring);

  const historyIndex=lines.findIndex(line=>/^(?:extrato|historico(?: de (?:transacoes|movimentacoes))?|movimentacoes|ultimas transacoes)$/i.test(plain(line)));
  const receipt=historyIndex<0&&/\b(?:comprovante|pix (?:enviado|recebido)|pagamento (?:realizado|efetuado)|transferencia (?:realizada|enviada|recebida)|compra aprovada)\b/.test(normalized);
  if(receipt){
    // Failed, scheduled and pending operations must not look like paid events.
    if(/\b(?:agendad[oa]|pendente|em processamento|nao (?:realizad[oa]|concluid[oa])|cancelad[oa]|falhou|estornad[oa])\b/.test(normalized)) return result('single_event',null,'ambiguous');
    const value=labeledAmount(lines,/\b(?:valor(?: (?:pago|enviado|recebido|da transferencia))?|total(?: pago)?)\b/);
    const visible=lines.filter(line=>!OFFER.test(plain(line))).flatMap(amounts);
    const unique=[...new Set(visible)];
    const amount=value??(unique.length===1?unique[0]:null);
    if(amount===null||amount<=0) return result('single_event',null,amount===null?'missing_amount':'ambiguous');
    const screen=snapshot('single_event',text);
    const observedDirection=direction(text);
    screen.movements=[{description:lines.find(line=>/comprovante|pix|pagamento|transferencia|compra/.test(plain(line)))?.slice(0,120)||'Comprovante',amountMinor:amount,direction:observedDirection,dateIso:dateIn(text),confidence:0.9,needsReview:true,visibleText:lines.slice(0,8).join(' ').slice(0,220)}];
    return result('single_event',screen);
  }

  const balance=parseAccountBalanceFromOcr(text);
  // Tabs mentioning a product do not establish that the product is displayed.
  if(balance){
    if(historyIndex>=0){
      balance.movements=historyMovements(lines,historyIndex);
      if(balance.movements.length) balance.screenType='mixed';
    }
    return result(balance.screenType,balance);
  }
  if(historyIndex>=0){
    const screen=snapshot('transaction_list',text);
    screen.movements=historyMovements(lines,historyIndex);
    return result('transaction_list',screen.movements.length?screen:null,screen.movements.length?'recognized':'ambiguous');
  }

  // An account home with an unreadable balance must not become a list of pots
  // or a transaction just because its advertising contains monetary values.
  if(/\bsaldo\b/.test(normalized)&&/\b(?:cofrinhos|investimentos|cripto|emprestimos|score de credito)\b/.test(normalized)) return result('account_home',null,'missing_amount');

  const statement=/\b(?:fatura|statement total|total da fatura)\b/.test(normalized);
  const card=statement||/\b(?:cartao|limite disponivel|limite total)\b/.test(normalized);
  if(card){
    const screen=snapshot(statement?'card_statement':'card_home',text);
    const total=labeledAmount(lines,/\b(?:total da fatura|valor da fatura|fatura (?:atual|fechada)|total a pagar)\b/);
    const available=labeledAmount(lines,/\blimite disponivel\b/);
    const limit=labeledAmount(lines,/\blimite total\b/);
    if(total===null&&available===null&&limit===null) return result(screen.screenType,null,'missing_amount');
    const dueIndex=lines.findIndex(line=>/vencimento|vence em/.test(plain(line)));
    screen.cards=[{name:'Cartão',last4:null,statementAmountMinor:total,dueOn:dueIndex>=0?dateIn(lines.slice(dueIndex,dueIndex+2).join(' ')):null,availableLimitMinor:available,totalLimitMinor:limit,confidence:0.9}];
    return result(screen.screenType,screen);
  }

  const pots=parseSavingsPotsFromOcr(text);
  if(pots) return result('savings_pots',pots);

  if(/\b(?:boleto|conta a pagar|cobranca)\b/.test(normalized)&&/\b(?:vencimento|vence|pagar ate)\b/.test(normalized)){
    const amount=labeledAmount(lines,/\b(?:valor do documento|valor a pagar|total a pagar|valor cobrado)\b/);
    if(amount===null||amount<=0) return result('bill',null,'missing_amount');
    const dueIndex=lines.findIndex(line=>/vencimento|vence|pagar ate/.test(plain(line)));
    const due=dueIndex>=0?dateIn(lines.slice(dueIndex,dueIndex+2).join(' ')):null;
    const screen=snapshot('mixed',text);
    screen.commitments=[{description:lines[0].slice(0,120),amountMinor:amount,dueOn:due,installment:null,confidence:0.9,needsReview:true}];
    return result('bill',screen);
  }
  return result('other',null,'unrecognized');
}
