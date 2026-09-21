import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decimalToMinor,
  institutionFor,
  isSafeOpenFinanceOrigin,
  isValidCpf,
  mapBelvoAccountType,
  normalizeCpf,
  normalizeLegalName
} from '../.core-dist/core/open-finance.js';

test('CPF é validado sem armazenar formatação',()=>{
  assert.equal(normalizeCpf('529.982.247-25'),'52998224725');
  assert.equal(isValidCpf('529.982.247-25'),true);
  assert.equal(isValidCpf('111.111.111-11'),false);
  assert.equal(isValidCpf('529.982.247-24'),false);
});

test('origem de retorno aceita somente endereços oficiais do NestBalance',()=>{
  assert.equal(isSafeOpenFinanceOrigin('https://nestbalance.millionsnest.com/'),true);
  assert.equal(isSafeOpenFinanceOrigin('https://mn-nestbalance-555464791734.web.app/'),true);
  assert.equal(isSafeOpenFinanceOrigin('http://nestbalance.millionsnest.com/'),false);
  assert.equal(isSafeOpenFinanceOrigin('https://evil.example/'),false);
});

test('Mercado Pago é prioridade e usa instituição OFDA conhecida',()=>{
  const mp=institutionFor('mercado_pago');
  assert.equal(mp.priority,1);
  assert.equal(mp.belvoInstitution,'ofmercadopago_br_retail');
  assert.ok(mp.capabilities.includes('balances'));
});

test('categorias OFDA são normalizadas sem transformar cartão em caixa',()=>{
  assert.equal(mapBelvoAccountType('CHECKING_ACCOUNT'),'bank');
  assert.equal(mapBelvoAccountType('CREDIT_CARD'),'credit_card');
  assert.equal(mapBelvoAccountType('INVESTMENT_ACCOUNT'),'investment');
  assert.equal(mapBelvoAccountType('LOAN_ACCOUNT'),'liability');
});

test('valores decimais do provider viram centavos com arredondamento seguro',()=>{
  assert.equal(decimalToMinor(1000.02),100002);
  assert.equal(decimalToMinor('131.50'),13150);
  assert.equal(decimalToMinor('abc'),null);
});

test('nome legal é normalizado e limitado',()=>{
  assert.equal(normalizeLegalName('  Maria   da Silva  '),'Maria da Silva');
});
