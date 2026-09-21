import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDocumentSignals } from '../.core-dist/core/document-signals.js';

test('detecta valores somente quando a moeda está explícita', () => {
  const result=detectDocumentSignals('Total R$ 1.234,56 e referência 9876,54');
  const money=result.candidates.find(x=>x.kind==='money');
  assert.equal(money?.amountMinor,123456);
  assert.equal(result.candidates.some(x=>x.raw.includes('9876,54')),false);
});

test('detecta data válida e rejeita data impossível', () => {
  const result=detectDocumentSignals('Emissão 29/02/2024. Ruído 31/02/2024.');
  assert.equal(result.candidates.some(x=>x.kind==='date'&&x.normalized==='2024-02-29'),true);
  assert.equal(result.candidates.some(x=>x.raw==='31/02/2024'),false);
});

test('05/12 de fatura vira candidato de parcela sem ser confirmado como fato', () => {
  const result=detectDocumentSignals('MAGALU 05/12 R$ 300,00');
  const installment=result.candidates.find(x=>x.kind==='installment');
  assert.equal(installment?.normalized,'5/12');
  assert.equal(installment?.evidence,'pattern_only');
});

test('parcela explicitamente rotulada ganha evidência explícita', () => {
  const result=detectDocumentSignals('Parcela 5 de 12 R$ 300');
  assert.equal(result.candidates.find(x=>x.kind==='installment')?.evidence,'explicit_label');
});

test('detecta boleto sem fingir validar checksum', () => {
  const code='00193373700000001000500940144816060680935031';
  const result=detectDocumentSignals(`Código ${code}`);
  const boleto=result.candidates.find(x=>x.kind==='boleto');
  assert.equal(boleto?.normalized,code);
  assert.equal(boleto?.evidence,'pattern_only');
});

test('detecta CPF e CNPJ válidos', () => {
  const result=detectDocumentSignals('CPF 529.982.247-25 CNPJ 04.252.011/0001-10');
  assert.equal(result.candidates.some(x=>x.kind==='cpf'&&x.normalized==='52998224725'),true);
  assert.equal(result.candidates.some(x=>x.kind==='cnpj'&&x.normalized==='04252011000110'),true);
});

test('limita análise a 100 mil caracteres', () => {
  const source='A'.repeat(100000)+' R$ 99,90';
  const result=detectDocumentSignals(source);
  assert.equal(result.scannedCharacters,100000);
  assert.equal(result.limited,true);
  assert.equal(result.candidates.some(x=>x.kind==='money'),false);
});
