import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_EVIDENCE_BYTES, sanitizeEvidenceName, signatureMatchesMime, validateEvidenceDeclaration } from '../.core-dist/core/evidence.js';

test('evidência aceita PDF dentro do limite', () => {
  assert.deepEqual(validateEvidenceDeclaration({ originalName: ' fatura setembro.pdf ', mimeType: 'application/pdf', size: 1200 }), {
    ok: true, normalizedName: 'fatura setembro.pdf', mimeType: 'application/pdf', size: 1200
  });
});

test('evidência rejeita tipo não permitido', () => {
  assert.equal(validateEvidenceDeclaration({ originalName: 'x.exe', mimeType: 'application/x-msdownload', size: 12 }).ok, false);
});

test('evidência rejeita arquivo acima do budget', () => {
  const result = validateEvidenceDeclaration({ originalName: 'grande.pdf', mimeType: 'application/pdf', size: MAX_EVIDENCE_BYTES + 1 });
  assert.deepEqual(result, { ok: false, reason: 'FILE_TOO_LARGE' });
});

test('nome remove separadores e caracteres de controle', () => {
  assert.equal(sanitizeEvidenceName('../comprovante\nPIX.pdf'), '.. comprovante PIX.pdf');
});

test('assinatura PDF precisa bater com MIME', () => {
  assert.equal(signatureMatchesMime('application/pdf', new TextEncoder().encode('%PDF-1.7')), true);
  assert.equal(signatureMatchesMime('application/pdf', new TextEncoder().encode('<html>')), false);
});

test('assinatura PNG é validada por bytes', () => {
  assert.equal(signatureMatchesMime('image/png', Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0])), true);
});
