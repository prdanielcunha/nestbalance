import test from 'node:test';
import assert from 'node:assert/strict';
import { redactFinancialText } from '../.core-dist/core/financial-redaction.js';

test('redacts card number but preserves only last four',()=>{
  const result=redactFinancialText('Cartão 4111 1111 1111 1234 limite R$ 5.000,00');
  assert.match(result.text,/•••• 1234/);
  assert.ok(!result.text.includes('4111'));
  assert.equal(result.redactionCount,1);
});

test('redacts CPF email phone account and Pix key',()=>{
  const result=redactFinancialText(`
    CPF 123.456.789-09
    email daniel@example.com
    telefone (43) 99999-8888
    Agência 1234
    Conta corrente 98765-4
    Chave Pix: daniel@example.com
  `);
  assert.ok(!result.text.includes('123.456.789-09'));
  assert.ok(!result.text.includes('daniel@example.com'));
  assert.ok(!result.text.includes('99999-8888'));
  assert.ok(!result.text.includes('98765-4'));
  assert.match(result.text,/PIX_KEY_REDACTED/);
});

test('redacts labeled person names and truncates oversized OCR',()=>{
  const result=redactFinancialText('Titular: Daniel Barbosa\n'+('x'.repeat(13000)));
  assert.match(result.text,/NAME_REDACTED/);
  assert.equal(result.truncated,true);
  assert.ok(result.text.length<=12000);
});
