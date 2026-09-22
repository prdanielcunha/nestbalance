import test from 'node:test';
import assert from 'node:assert/strict';
import { accountDedupKey, parseMoneyInputToMinor, validateAccountDraft } from '../.core-dist/core/accounts.js';

test('saldo em reais vira centavos sem ponto flutuante persistido',()=>{
  assert.equal(parseMoneyInputToMinor('4.820,35'),482035);
  assert.equal(parseMoneyInputToMinor('4820,35'),482035);
  assert.equal(parseMoneyInputToMinor('-120,50'),-12050);
  assert.equal(parseMoneyInputToMinor('4.820'),482000);
});

test('saldo em inglês aceita separadores internacionais sem ambiguidade',()=>{
  assert.equal(parseMoneyInputToMinor('1,250.50','en'),125050);
  assert.equal(parseMoneyInputToMinor('1,250','en'),125000);
  assert.equal(parseMoneyInputToMinor('1250.50','en'),125050);
  assert.equal(parseMoneyInputToMinor('4.820','en'),null);
});

test('saldo inválido falha fechado',()=>{
  assert.equal(parseMoneyInputToMinor('abc'),null);
  assert.equal(parseMoneyInputToMinor('12,345'),null);
});

test('conta válida é normalizada',()=>{
  const result=validateAccountDraft({name:'  Nubank  ',type:'bank',balanceMinor:482000});
  assert.equal(result.ok,true);
  if(result.ok){
    assert.equal(result.value.name,'Nubank');
    assert.equal(result.value.currency,'BRL');
  }
});

test('dedup ignora caixa e espaços do nome',()=>{
  assert.equal(accountDedupKey(' Nubank ','bank'),accountDedupKey('nubank','bank'));
});

test('tipo arbitrário é rejeitado',()=>{
  assert.deepEqual(validateAccountDraft({name:'Conta',type:'crypto',balanceMinor:10}),{ok:false,reason:'INVALID_TYPE'});
});
