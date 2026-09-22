import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAccountBalanceFromOcr} from '../.core-dist/core/account-balance-import.js';

test('uses the amount tied to the primary Saldo label and ignores secondary products',()=>{
  const screen=parseAccountBalanceFromOcr(`
Olá, Ayessa e Dani
Saldo
R$ 2724
105% do CDI
Bradesco R$ 0,05
Empréstimos
Dinheiro Express
R$ 420
Cartão de crédito
Limite disponível
R$ 2.25828
Total até hoje
R$ 26293
`);
  assert.ok(screen);
  assert.equal(screen.accounts.length,1);
  assert.equal(screen.accounts[0].name,'Saldo disponível');
  assert.equal(screen.accounts[0].balanceMinor,2724);
});

test('preserves ordinary Brazilian decimal formatting for balances',()=>{
  const screen=parseAccountBalanceFromOcr('Saldo disponível\nR$ 1.234,56\nLimite R$ 5.000,00');
  assert.ok(screen);
  assert.equal(screen.accounts[0].balanceMinor,123456);
});


test('reads thousands plus superscript cents when OCR concatenates them',()=>{
  const screen=parseAccountBalanceFromOcr('Saldo\nR$ 2.72400\nCartão de crédito\nR$ 26293');
  assert.ok(screen);
  assert.equal(screen.accounts[0].balanceMinor,272400);
});
