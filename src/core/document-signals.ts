export const DOCUMENT_TEXT_MAX_CHARACTERS = 100_000;
export const DOCUMENT_TEXT_MAX_CANDIDATES = 120;
export const DOCUMENT_TEXT_CONTEXT_RADIUS = 48;

export type DocumentSignalKind =
  | 'money'
  | 'date'
  | 'installment'
  | 'pix_e2e'
  | 'pix_key'
  | 'boleto'
  | 'cpf'
  | 'cnpj';

export type DocumentSignalEvidence = 'validated' | 'explicit_label' | 'pattern_only';

export type DocumentSignal = {
  kind: DocumentSignalKind;
  raw: string;
  normalized: string;
  start: number;
  end: number;
  context: string;
  evidence: DocumentSignalEvidence;
  amountMinor?: number;
  installmentCurrent?: number;
  installmentTotal?: number;
  boletoDigits?: 44 | 47 | 48;
};

export type DocumentSignalsResult = {
  deterministic: true;
  inputCharacters: number;
  scannedCharacters: number;
  limited: boolean;
  candidateLimitReached: boolean;
  candidates: DocumentSignal[];
};

const digits = (value: string) => value.replace(/\D/g, '');

function contextFor(text: string, start: number, end: number) {
  return text
    .slice(Math.max(0, start - DOCUMENT_TEXT_CONTEXT_RADIUS), Math.min(text.length, end + DOCUMENT_TEXT_CONTEXT_RADIUS))
    .replace(/\s+/g, ' ')
    .trim();
}

function push(target: DocumentSignal[], text: string, candidate: Omit<DocumentSignal, 'context'>) {
  target.push({ ...candidate, context: contextFor(text, candidate.start, candidate.end) });
}

function validCalendarDate(year: number, month: number, day: number) {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function iso(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMoney(raw: string) {
  let value = raw.replace(/^\s*(?:R\$|BRL)\s*/i, '').trim().replace(/\s+/g, '');
  if (!/^[0-9.,]+$/.test(value)) return null;
  let integer = value;
  let fraction = '';
  if (value.includes(',')) {
    const at = value.lastIndexOf(',');
    fraction = value.slice(at + 1);
    if (fraction.length > 2) return null;
    integer = value.slice(0, at).replace(/\./g, '');
  } else if (value.includes('.')) {
    const parts = value.split('.');
    const tail = parts.at(-1) || '';
    if (parts.length === 2 && tail.length <= 2) {
      integer = parts[0];
      fraction = tail;
    } else if (parts.slice(1).every(part => part.length === 3)) {
      integer = parts.join('');
    } else return null;
  }
  if (!/^\d+$/.test(integer) || (fraction && !/^\d{1,2}$/.test(fraction))) return null;
  const amountMinor = Number(integer) * 100 + Number(fraction.padEnd(2, '0') || '0');
  return Number.isSafeInteger(amountMinor) ? amountMinor : null;
}

function validCpf(raw: string) {
  const value = digits(raw);
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
}

function validNumericCnpj(raw: string) {
  const value = digits(raw);
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const calc = (length: 12 | 13) => {
    const weights = length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(value[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(value[12]) && calc(13) === Number(value[13]);
}

function collectMoney(text: string, out: DocumentSignal[]) {
  for (const match of text.matchAll(/(?:R\$|\bBRL\b)\s*\d[\d. ]*(?:,\d{1,2})?(?:\.\d{1,2})?/gi)) {
    const raw = match[0].trimEnd();
    const amountMinor = parseMoney(raw);
    if (amountMinor === null) continue;
    push(out, text, { kind:'money', raw, normalized:`BRL:${amountMinor}`, amountMinor, start:match.index, end:match.index+raw.length, evidence:'explicit_label' });
  }
}

function collectDates(text: string, out: DocumentSignal[]) {
  for (const match of text.matchAll(/\b(\d{2})[/.](\d{2})[/.](\d{4})\b/g)) {
    const day=Number(match[1]), month=Number(match[2]), year=Number(match[3]);
    if (!validCalendarDate(year,month,day)) continue;
    push(out,text,{kind:'date',raw:match[0],normalized:iso(year,month,day),start:match.index,end:match.index+match[0].length,evidence:'validated'});
  }
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const year=Number(match[1]), month=Number(match[2]), day=Number(match[3]);
    if (!validCalendarDate(year,month,day)) continue;
    push(out,text,{kind:'date',raw:match[0],normalized:iso(year,month,day),start:match.index,end:match.index+match[0].length,evidence:'validated'});
  }
}

function collectInstallments(text: string, out: DocumentSignal[]) {
  for (const match of text.matchAll(/\b(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/gi)) {
    const current=Number(match[1]), total=Number(match[2]);
    if (current < 1 || total < 2 || current > total || total > 120) continue;
    const local=contextFor(text,match.index,match.index+match[0].length);
    if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(local)) continue;
    push(out,text,{kind:'installment',raw:match[0],normalized:`${current}/${total}`,installmentCurrent:current,installmentTotal:total,start:match.index,end:match.index+match[0].length,evidence:/parc|vez(?:es)?/i.test(local)?'explicit_label':'pattern_only'});
  }
}

function collectPix(text: string, out: DocumentSignal[]) {
  for (const match of text.matchAll(/(?:end\s*to\s*end|e2e|id\s+pix)\s*[:=-]\s*([A-Z0-9]{20,40})/gi)) {
    const value=match[1]; const offset=match[0].lastIndexOf(value); const start=match.index+offset;
    push(out,text,{kind:'pix_e2e',raw:value,normalized:value.toUpperCase(),start,end:start+value.length,evidence:'explicit_label'});
  }
  for (const match of text.matchAll(/(?:chave\s+pix|pix)\s*[:=-]\s*([^\s,;]{3,120})/gi)) {
    const value=match[1]; const offset=match[0].lastIndexOf(value); const start=match.index+offset;
    push(out,text,{kind:'pix_key',raw:value,normalized:value.toLowerCase(),start,end:start+value.length,evidence:'explicit_label'});
  }
}

function collectBoleto(text: string, out: DocumentSignal[]) {
  for (const match of text.matchAll(/(?<!\d)(?:\d[\s.-]?){44,48}(?![\s.-]?\d)/g)) {
    const raw=match[0].replace(/[\s.-]+$/,''); const normalized=digits(raw);
    if (![44,47,48].includes(normalized.length)) continue;
    push(out,text,{kind:'boleto',raw,normalized,boletoDigits:normalized.length as 44|47|48,start:match.index,end:match.index+raw.length,evidence:'pattern_only'});
  }
}

function collectTaxIds(text:string,out:DocumentSignal[]) {
  for (const match of text.matchAll(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g)) {
    if (!validCpf(match[0])) continue;
    push(out,text,{kind:'cpf',raw:match[0],normalized:digits(match[0]),start:match.index,end:match.index+match[0].length,evidence:'validated'});
  }
  for (const match of text.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)) {
    if (!validNumericCnpj(match[0])) continue;
    push(out,text,{kind:'cnpj',raw:match[0],normalized:digits(match[0]),start:match.index,end:match.index+match[0].length,evidence:'validated'});
  }
}

export function detectDocumentSignals(input: string): DocumentSignalsResult {
  const source = typeof input === 'string' ? input : '';
  const text = source.slice(0, DOCUMENT_TEXT_MAX_CHARACTERS);
  const candidates: DocumentSignal[] = [];
  if (text.trim()) {
    collectMoney(text,candidates);
    collectDates(text,candidates);
    collectInstallments(text,candidates);
    collectPix(text,candidates);
    collectBoleto(text,candidates);
    collectTaxIds(text,candidates);
  }
  const unique = new Map<string,DocumentSignal>();
  for (const c of candidates) {
    const key=`${c.kind}|${c.start}|${c.end}|${c.normalized}`;
    if (!unique.has(key)) unique.set(key,c);
  }
  const ordered=[...unique.values()].sort((a,b)=>a.start-b.start || a.end-b.end || a.kind.localeCompare(b.kind));
  const candidateLimitReached=ordered.length>DOCUMENT_TEXT_MAX_CANDIDATES;
  return {
    deterministic:true,
    inputCharacters:source.length,
    scannedCharacters:text.length,
    limited:source.length>DOCUMENT_TEXT_MAX_CHARACTERS || candidateLimitReached,
    candidateLimitReached,
    candidates:ordered.slice(0,DOCUMENT_TEXT_MAX_CANDIDATES)
  };
}
