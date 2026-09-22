import test from 'node:test';
import assert from 'node:assert/strict';
import { inferCardBrandFromText, parseLocalCardText } from '../.core-dist/core/card-local-reader.js';

test('identifica bandeira por texto sem número do cartão',()=>{
  assert.equal(inferCardBrandFromText('Nubank Mastercard Platinum'),'mastercard');
  assert.equal(inferCardBrandFromText('Visa Infinite'),'visa');
  assert.equal(inferCardBrandFromText('American Express'),'amex');
  assert.equal(inferCardBrandFromText('Cartão ELO'),'elo');
});

test('identifica bandeira por número somente em memória',()=>{
  assert.equal(inferCardBrandFromText('4111 1111 1111 1111'),'visa');
  assert.equal(inferCardBrandFromText('5555 5555 5555 4444'),'mastercard');
  assert.equal(inferCardBrandFromText('378282246310005'),'amex');
});

test('extrai dados úteis de print bancário',()=>{
  const result=parseLocalCardText(`
    Nubank
    Mastercard
    Cartão final 4321
    Fechamento da fatura dia 7
    Vencimento da fatura dia 14
    Limite total R$ 8.500,00
  `);
  assert.equal(result.institutionName,'Nubank');
  assert.equal(result.brand,'mastercard');
  assert.equal(result.last4,'4321');
  assert.equal(result.closingDay,7);
  assert.equal(result.dueDay,14);
  assert.equal(result.totalLimitMinor,850000);
});

test('não inventa campos ausentes',()=>{
  const result=parseLocalCardText('Cartão virtual para compras online');
  assert.equal(result.brand,'other');
  assert.equal(result.last4,null);
  assert.equal(result.institutionName,null);
  assert.equal(result.closingDay,null);
  assert.equal(result.dueDay,null);
  assert.equal(result.totalLimitMinor,null);
});
