import type { FinancialInterpretation } from './types.js';

export type FingerprintInput = {
  amountMinor: number;
  date?: string;
  description?: string;
  counterparty?: string;
  accountId?: string;
  installmentCurrent?: number;
  externalId?: string;
  dueDay?: number;
  recurrence?: string;
  kind?: string;
};

function normalizeText(value = "") {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalFingerprint(input: FingerprintInput): string {
  if (input.externalId) return `ext:${normalizeText(input.externalId)}`;
  return [
    input.kind ?? 'movement',
    input.amountMinor,
    input.date?.slice(0, 10) ?? "nodate",
    normalizeText(input.description).slice(0, 48),
    normalizeText(input.counterparty).slice(0, 48),
    input.accountId ?? "noaccount",
    input.installmentCurrent ?? "noinstallment",
    input.dueDay ?? "nodueday",
    input.recurrence ?? "norecurrence"
  ].join("|");
}

export function fingerprintForInterpretation(interpretation: FinancialInterpretation, todayIso: string): string {
  return canonicalFingerprint({
    kind: interpretation.kind,
    amountMinor: interpretation.money.amountMinor,
    date: interpretation.kind === 'transaction' ? todayIso : undefined,
    description: interpretation.description,
    installmentCurrent: interpretation.installment?.current,
    dueDay: interpretation.dueDay,
    recurrence: interpretation.recurrence
  });
}

export function probableDuplicateScore(a: FingerprintInput, b: FingerprintInput): number {
  if (a.externalId && b.externalId && normalizeText(a.externalId) === normalizeText(b.externalId)) return 1;
  let score = 0;
  let weight = 0;
  const add = (matches: boolean, w: number) => { weight += w; if (matches) score += w; };
  add(a.amountMinor === b.amountMinor, 0.35);
  add(Boolean(a.date && b.date && a.date.slice(0, 10) === b.date.slice(0, 10)), 0.2);
  add(Boolean(a.description && b.description && normalizeText(a.description) === normalizeText(b.description)), 0.2);
  add(Boolean(a.counterparty && b.counterparty && normalizeText(a.counterparty) === normalizeText(b.counterparty)), 0.15);
  add(Boolean(a.installmentCurrent && b.installmentCurrent && a.installmentCurrent === b.installmentCurrent), 0.1);
  return weight ? Number((score / weight).toFixed(3)) : 0;
}
