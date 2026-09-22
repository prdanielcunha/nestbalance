import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeviceContext, normalizeDeviceLabel, isNestBalanceSessionRevoked } from '../.core-dist/core/security.js';

test('normaliza contexto de dispositivo sem aceitar ids fracos',()=>{
  assert.deepEqual(normalizeDeviceContext({id:'1234567890abcdef',label:'  iPhone  '}),{id:'1234567890abcdef',label:'iPhone'});
  assert.equal(normalizeDeviceContext({id:'short',label:'iPhone'}),null);
  assert.equal(normalizeDeviceContext(null),null);
});

test('remove caracteres de controle e limita rótulo',()=>{
  assert.equal(normalizeDeviceLabel('Meu\n  iPhone\u0000'),'Meu iPhone');
  assert.equal(normalizeDeviceLabel('x'.repeat(100)).length,60);
});

test('revoga somente autenticações anteriores ao corte NestBalance',()=>{
  assert.equal(isNestBalanceSessionRevoked(100,200),true);
  assert.equal(isNestBalanceSessionRevoked(200,200),false);
  assert.equal(isNestBalanceSessionRevoked(201,200),false);
  assert.equal(isNestBalanceSessionRevoked(0,200),false);
});
