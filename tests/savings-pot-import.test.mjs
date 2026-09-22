import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSavingsPotsFromOcr} from '../.core-dist/core/savings-pot-import.js';
import {cleanSavingsPotDisplayName,groupSavingsPots} from '../.core-dist/core/savings-pots.js';

test('recognizes Mercado Pago cofrinhos from OCR',()=>{
  const text=`
Cofrinhos
R$ 2.563,96
115% do CDI
Meli+
Seus cofrinhos
Aniversário Davi
R$ 1.015,68
Meta: R$ 2.550
Aniversário
R$ 522,52
Davi
R$ 377,22
Reservas
R$ 300,82
Cartões
R$ 149,15
Dízimo
R$ 100,10
Studio Z
R$ 68,37
Fralda
R$ 30,10
Carro
R$ 0
Meta: R$ 1.250
`;
  const screen=parseSavingsPotsFromOcr(text);
  assert.ok(screen);
  assert.equal(screen.institution,'Mercado Pago');
  assert.equal(screen.pots.length,9);
  assert.equal(screen.pots[0].name,'Aniversário Davi');
  assert.equal(screen.pots[0].balanceMinor,101568);
  assert.equal(screen.pots[0].goalMinor,255000);
  assert.equal(screen.pots.at(-1).name,'Carro');
  assert.equal(screen.pots.at(-1).balanceMinor,0);
  assert.equal(screen.pots.at(-1).goalMinor,125000);
});

test('groups same goal across institutions without double counting the goal',()=>{
  const groups=groupSavingsPots([
    {id:'a',name:'Aniversário Davi',balanceMinor:100000,goalMinor:255000,currency:'BRL',institutionName:'Mercado Pago',source:'screen_import',status:'active',scope:'household'},
    {id:'b',name:'Aniversario Davi',balanceMinor:50000,goalMinor:255000,currency:'BRL',institutionName:'Nubank',source:'screen_import',status:'active',scope:'household'}
  ]);
  assert.equal(groups.length,1);
  assert.equal(groups[0].balanceMinor,150000);
  assert.equal(groups[0].goalMinor,255000);
  assert.equal(groups[0].sources.length,2);
});


test('recognizes a pot when OCR merges name, balance and goal on one line',()=>{
  const screen=parseSavingsPotsFromOcr('Cofrinhos\nMeli+\nAniversário Davi R$ 1.015,68 Meta: R$ 2.550');
  assert.ok(screen);
  assert.equal(screen.pots.length,1);
  assert.equal(screen.pots[0].name,'Aniversário Davi');
  assert.equal(screen.pots[0].balanceMinor,101568);
  assert.equal(screen.pots[0].goalMinor,255000);
});


test('recognizes an explicit Cofrinho deadline without guessing a year',()=>{
  const screen=parseSavingsPotsFromOcr('Cofrinhos\nViagem\nR$ 500,00\nMeta: R$ 3.000,00\nPrazo: 15/12/2026');
  assert.ok(screen);
  assert.equal(screen.pots[0].targetDate,'2026-12-15');
});


test('OCR com espaços no milhar preserva saldo e meta do cofrinho',()=>{
  const screen=parseSavingsPotsFromOcr('Cofrinhos\nNubank\nViagem\nR$ 1 015,68\nMeta: R$ 2 550,00');
  assert.ok(screen);
  assert.equal(screen.institution,'Nubank');
  assert.equal(screen.pots.length,1);
  assert.equal(screen.pots[0].balanceMinor,101568);
  assert.equal(screen.pots[0].goalMinor,255000);
});

test('metas conflitantes entre bancos ficam explícitas sem somar metas',()=>{
  const groups=groupSavingsPots([
    {id:'a',name:'Viagem',balanceMinor:100000,goalMinor:300000,currency:'BRL',institutionName:'Nubank',source:'screen_import',status:'active',scope:'household'},
    {id:'b',name:'Viagem',balanceMinor:50000,goalMinor:350000,currency:'BRL',institutionName:'Inter',source:'screen_import',status:'active',scope:'household'}
  ]);
  assert.equal(groups.length,1);
  assert.equal(groups[0].balanceMinor,150000);
  assert.equal(groups[0].goalMinor,350000);
  assert.equal(groups[0].goalConflict,true);
});


test('removes OCR icon noise from imported savings pot names',()=>{
  const screen=parseSavingsPotsFromOcr(`Cofrinhos
Meli+
t Aniversário Davi R$ 1.015,68
VV Aniversário R$ 522,52
Davi R$ 361,00`);
  assert.ok(screen);
  assert.deepEqual(screen.pots.map(item=>item.name),['Aniversário Davi','Aniversário','Davi']);
  assert.equal(cleanSavingsPotDisplayName('t Aniversário Davi'),'Aniversário Davi');
  assert.equal(cleanSavingsPotDisplayName('VV Aniversário'),'Aniversário');
  assert.equal(cleanSavingsPotDisplayName('TV nova'),'TV nova');
});
