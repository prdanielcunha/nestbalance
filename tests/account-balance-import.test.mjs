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


const referenceScreen=(amount)=>`16:34\nOlá, Daniel\nSaldo Cofrinhos Investimentos Cripto\n${amount}\n105% do CDI\nDeposite mais R$ 970 este mês para ter 105% do CDI\nDepositar\nMeli Dólar\nCompra internacional\nMUSD 0\nEmpréstimos\nSaiba como pagar em até 3x sem cartão.\nR$ 340\nScore de crédito\n783`;
for(const amount of ['R$ 0⁰⁹','R$ 009','R$ 0 09','R$ 0\n09','R$ 0,09']){
  test(`Mercado Pago primary balance with raised cents: ${JSON.stringify(amount)}`,()=>{
    const screen=parseAccountBalanceFromOcr(referenceScreen(amount));
    assert.equal(screen?.institution,'Mercado Pago');
    assert.equal(screen?.accounts.length,1);
    assert.equal(screen?.accounts[0].balanceMinor,9);
    assert.deepEqual(screen?.movements,[]);
    assert.deepEqual(screen?.commitments,[]);
  });
}
test('does not use a deposit promotion when the balance is hidden',()=>{
  assert.equal(parseAccountBalanceFromOcr(referenceScreen('••••')),null);
});
test('does not infer a bank from generic colors or financial labels',()=>{
  assert.equal(parseAccountBalanceFromOcr('Saldo\nR$ 0,09\n105% do CDI')?.institution,null);
});
test('reads explicit institution from header',()=>{
  assert.equal(parseAccountBalanceFromOcr('Nubank\nSaldo disponível\nR$ 123,45')?.institution,'Nubank');
});
test('does not mistake a credit limit for the primary balance',()=>{
  assert.equal(parseAccountBalanceFromOcr('Saldo\nLimite disponível\nR$ 340'),null);
});
test('retains a visible zero balance',()=>{
  assert.equal(parseAccountBalanceFromOcr('Mercado Pago\nSaldo\nR$ 0,00')?.accounts[0].balanceMinor,0);
});

test('reads a balance below separately recognized navigation tabs',()=>{
  const screen=parseAccountBalanceFromOcr('Saldo\nCofrinhos\nInvestimentos\nCripto\nR$ 0 09\nMeli Dólar');
  assert.equal(screen?.accounts[0].balanceMinor,9);
  assert.equal(screen?.institution,'Mercado Pago');
});
