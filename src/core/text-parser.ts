import type { FinancialInterpretation } from "./types.js";

const currencyNumber = /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|-?\d+(?:[.,]\d{1,2})?)/i;
const dueDayPattern = /\b(?:dia|vence(?:\s+dia)?)\s*(\d{1,2})\b/i;
const installmentPattern = /\b(?:parc(?:ela)?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i;

function parseAmountMinor(raw: string): number {
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  return Math.round(Number(normalized) * 100);
}

function cleanDescription(text: string): string {
  return text
    .replace(currencyNumber, " ")
    .replace(dueDayPattern, " ")
    .replace(installmentPattern, " ")
    .replace(/\b(todo mês|mensal|mensalmente|recorrente)\b/gi, " ")
    .replace(/\bentre minhas contas\b/gi, " ")
    .replace(/\b(paguei|recebi|gastei|comprei|pagar|receber|transferi|transferência|transferencia)\b/gi, " ")
    .replace(/[·|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFinancialText(input: string): FinancialInterpretation {
  const text = input.trim();
  if (!text) throw new Error("EMPTY_INPUT");

  const amountMatch = text.match(currencyNumber);
  const dueMatch = text.match(dueDayPattern);
  const installmentMatch = text.match(installmentPattern);
  const isTransfer = /\b(transferi|transfer[eê]ncia|transferencia|entre minhas contas)\b/i.test(text);
  const isIncome = !isTransfer && /\b(recebi|receber|entrada|sal[aá]rio|caiu)\b/i.test(text);
  const isPaid = !isTransfer && /\b(paguei|pago|gastei|comprei)\b/i.test(text);
  const recurring = /\b(todo mês|mensal|mensalmente|recorrente)\b/i.test(text);
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
      direction: isIncome || isPaid || kind === "commitment" ? 0.9 : 0.5,
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
