import type { FinancialInterpretation } from "./types.js";

const currencyNumber = /(?:R\$\s*)?(-?(?:\d{1,3}(?:[.\u00a0 ]\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?))/i;
const dueDayPattern = /\b(?:dia|día|day|vence(?:\s+(?:dia|día|el))?|due(?:\s+on)?(?:\s+day)?)\s*(\d{1,2})\b/i;
const installmentPattern = /\b(?:(?:parc(?:ela)?|installment|cuota)\s*)?(\d{1,2})\s*(?:\/|de|of)\s*(\d{1,2})\b/i;
const explicitInstallmentPattern = /\b(?:parc(?:ela)?|installment|cuota)\s*(\d{1,2})\s*(?:\/|de|of)\s*(\d{1,2})\b/i;
const genericInstallmentPattern = /\b(\d{1,2})\s*(?:\/|de|of)\s*(\d{1,2})\b/gi;
const recurringPattern = /\b(todo mês|mensal|mensalmente|recorrente|every month|monthly|recurring|cada mes|mensual|mensualmente|recurrente)\b/i;
const calendarDatePattern = /\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g;
const timePattern = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

function folded(value:string){
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function maskMatch(value:string,pattern:RegExp){
  return value.replace(pattern,match=>' '.repeat(match.length));
}

function installmentMatchFromText(text:string,amountIndex:number|null){
  const explicit=text.match(explicitInstallmentPattern);
  if(explicit) return explicit;

  for(const match of text.matchAll(genericInstallmentPattern)){
    const index=match.index??0;
    const before=text.slice(Math.max(0,index-16),index);
    const after=text.slice(index+match[0].length,index+match[0].length+24);
    const looksLikeDate=
      /\b(?:em|data|dia)\s*$/i.test(before)||
      /^\s*(?:às|as)\s+\d{1,2}:\d{2}/i.test(after)||
      /^\s*[\/.\-]\s*\d{2,4}\b/.test(after);
    if(looksLikeDate) continue;
    if(amountIndex!==null&&index<amountIndex) continue;
    return match;
  }
  return null;
}

function parseAmountMinor(raw: string): number {
  const compact=raw.replace(/\s/g,'');
  const negative=compact.startsWith('-');
  const unsigned=negative?compact.slice(1):compact;
  const comma=unsigned.lastIndexOf(',');
  const dot=unsigned.lastIndexOf('.');
  let normalized=unsigned;

  if(comma>=0&&dot>=0){
    const decimalIndex=Math.max(comma,dot);
    const decimal=unsigned[decimalIndex];
    const thousands=decimal===','?'.':',';
    normalized=unsigned.replace(new RegExp('\\'+thousands,'g'),'');
    normalized=normalized.replace(decimal,'.');
  }else{
    const separator=comma>=0?',':dot>=0?'.':null;
    if(separator){
      const parts=unsigned.split(separator);
      if(parts.length>2){
        const tail=parts.at(-1)||'';
        normalized=tail.length<=2
          ? parts.slice(0,-1).join('')+'.'+tail
          : parts.join('');
      }else{
        const [whole,fraction='']=parts;
        normalized=fraction.length===3
          ? whole+fraction
          : whole+'.'+fraction;
      }
    }
  }

  const value=Number(normalized)*(negative?-1:1);
  return Math.round(value*100);
}

function cleanDescription(text: string): string {
  return text
    .replace(dueDayPattern, " ")
    .replace(installmentPattern, " ")
    .replace(calendarDatePattern, " ")
    .replace(timePattern, " ")
    .replace(recurringPattern, " ")
    .replace(currencyNumber, " ")
    .replace(/\b(entre minhas contas|between my accounts|entre mis cuentas)\b/gi, " ")
    .replace(/\b(paguei|pago|gastei|comprei|pagar|receber|recebi|transferi|transferência|transferencia|paid|spent|bought|pay|received|receive|income|transferred|transfer|pague|gaste|compre|pagar|recibi|recibir|ingreso|transferi|transferencia)\b/gi, " ")
    .replace(/[·|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFinancialText(input: string): FinancialInterpretation {
  const text = input.trim();
  if (!text) throw new Error("EMPTY_INPUT");

  const normalized=folded(text);
  const dueMatch = text.match(dueDayPattern);
  const amountSearchText=maskMatch(
    maskMatch(
      maskMatch(
        maskMatch(text,dueDayPattern),
        installmentPattern
      ),
      calendarDatePattern
    ),
    timePattern
  );
  const amountMatch = amountSearchText.match(currencyNumber);
  const installmentMatch = installmentMatchFromText(text,amountMatch?.index??null);
  const isTransfer = /\b(transferi|transferencia|transferred|transfer|entre minhas contas|between my accounts|entre mis cuentas)\b/i.test(normalized);
  const isIncome = !isTransfer && /\b(recebi|receber|entrada|salario|caiu|received|receive|income|salary|got paid|recibi|recibir|ingreso|sueldo)\b/i.test(normalized);
  const isPaid = !isTransfer && /\b(paguei|pago|gastei|comprei|paid|spent|bought|pague|gaste|compre)\b/i.test(normalized);
  const recurring = recurringPattern.test(text);
  const needsReview: string[] = [];

  if (!amountMatch) needsReview.push("amount");
  const amountMinor = amountMatch ? parseAmountMinor(amountMatch[1]) : 0;
  if (amountMinor <= 0) needsReview.push("amount_positive");

  let dueDay: number | undefined;
  if (dueMatch) {
    dueDay = Number(dueMatch[1]);
    if (dueDay < 1 || dueDay > 31) {
      needsReview.push("due_day");
      dueDay = undefined;
    }
  }

  let installment: FinancialInterpretation["installment"];
  if (installmentMatch) {
    const current = Number(installmentMatch[1]);
    const total = Number(installmentMatch[2]);
    if (current >= 1 && total >= current && total <= 120) installment = { current, total };
    else needsReview.push("installment");
  }

  const description = cleanDescription(text) || "Movimento";
  const kind: FinancialInterpretation["kind"] = recurring || dueDay ? "commitment" : "transaction";
  if (!isPaid && !isIncome && !isTransfer && kind === "transaction") needsReview.push("direction");
  if (dueMatch && !recurring && !installment) needsReview.push("recurrence");

  const confidenceScore = Math.max(0, 1 - needsReview.length * 0.22);
  const confidence = confidenceScore >= 0.82 ? "high" : confidenceScore >= 0.55 ? "medium" : "low";

  return {
    kind,
    description,
    money: { currency: "BRL", amountMinor },
    direction: isTransfer ? "transfer" : isIncome ? "income" : "expense",
    dueDay,
    recurring,
    recurrence: recurring ? "monthly" : undefined,
    installment,
    confidence,
    fieldConfidence: {
      amount: amountMatch ? 0.99 : 0,
      description: description === "Movimento" ? 0.4 : 0.88,
      direction: isIncome || isPaid || isTransfer || kind === "commitment" ? 0.9 : 0.5,
      dueDay: dueDay ? 0.96 : 0,
      installment: installment ? 0.98 : 0
    },
    sourceText: text,
    parserVersion: "text-v0.1",
    needsReview: [...new Set(needsReview)]
  };
}

export function parseFinancialList(input: string): FinancialInterpretation[] {
  const lines = input.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  if (lines.length <= 1) return [parseFinancialText(input)];
  return lines.map(parseFinancialText);
}
