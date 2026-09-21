import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyVaultPreviewBytes } from '../server/vault-verifier.js';

const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF','latin1');
const sha=createHash('sha256').update(pdf).digest('hex');

test('preview aceita original que mantém tamanho assinatura e hash',()=>{
  assert.deepEqual(verifyVaultPreviewBytes({size:pdf.length,mimeType:'application/pdf',sha256:sha},pdf),{ok:true});
});

test('preview rejeita tamanho diferente',()=>{
  assert.deepEqual(verifyVaultPreviewBytes({size:pdf.length+1,mimeType:'application/pdf',sha256:sha},pdf),{ok:false,reason:'size_mismatch'});
});

test('preview rejeita MIME incompatível com os bytes',()=>{
  assert.deepEqual(verifyVaultPreviewBytes({size:pdf.length,mimeType:'image/png',sha256:sha},pdf),{ok:false,reason:'signature_mismatch'});
});

test('preview rejeita hash adulterado',()=>{
  assert.deepEqual(verifyVaultPreviewBytes({size:pdf.length,mimeType:'application/pdf',sha256:'0'.repeat(64)},pdf),{ok:false,reason:'hash_mismatch'});
});
