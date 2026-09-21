export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'text/plain',
  'text/csv'
] as const;

export type AllowedEvidenceMime = typeof ALLOWED_EVIDENCE_MIME_TYPES[number];

export type EvidenceDeclaration = {
  originalName: string;
  mimeType: string;
  size: number;
};

export type EvidenceValidation =
  | { ok: true; normalizedName: string; mimeType: AllowedEvidenceMime; size: number }
  | { ok: false; reason: 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'INVALID_NAME' };

export function sanitizeEvidenceName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\\/\0\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function validateEvidenceDeclaration(input: EvidenceDeclaration): EvidenceValidation {
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, reason: 'EMPTY_FILE' };
  if (input.size > MAX_EVIDENCE_BYTES) return { ok: false, reason: 'FILE_TOO_LARGE' };
  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(input.mimeType as AllowedEvidenceMime)) return { ok: false, reason: 'UNSUPPORTED_TYPE' };
  const normalizedName = sanitizeEvidenceName(input.originalName);
  if (!normalizedName) return { ok: false, reason: 'INVALID_NAME' };
  return { ok: true, normalizedName, mimeType: input.mimeType as AllowedEvidenceMime, size: Math.trunc(input.size) };
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return new TextDecoder('ascii').decode(bytes.slice(start, end));
}

function starts(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function signatureMatchesMime(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === 'application/pdf') return ascii(bytes, 0, 5) === '%PDF-';
  if (mimeType === 'image/jpeg') return starts(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === 'image/png') return starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6));
  if (mimeType === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP';
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE';
  if (mimeType === 'audio/ogg') return ascii(bytes, 0, 4) === 'OggS';
  if (mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') return ascii(bytes, 4, 8) === 'ftyp';
  if (mimeType === 'audio/mpeg') {
    return ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    const head = bytes.slice(0, Math.min(bytes.length, 4096));
    return !head.some(byte => byte === 0);
  }
  return false;
}
