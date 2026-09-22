import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRecurringCommitmentsFromOcr} from '../.core-dist/core/recurring-commitment-import.js';

test('recognizes a notes table of recurring bills as monthly commitments',()=>{
  const screen=parseRecurringCommitmentsFromOcr(`
Débitos recorrentes
Débito Data Valor
Studio Z 5 300
Cartão MP 5 262
Itaú 8 121,32
Amazon 10 55,67
Neon 11 220
Marisa 15 60
Santander 16 112
Unha 16 110
cartão Dani 18 120
Internet vivo 20 166
Carro 20 1.300
Riachuelo 23 98
Cartão 28 400
Davi 250

Vencimentos:
Cadeirinha Davi: Setembro 2026
`);
  assert.ok(screen);
  assert.equal(screen.commitments.length,14);
  assert.equal(screen.commitments[0].description,'Studio Z');
  assert.equal(screen.commitments[0].dueDay,5);
  assert.equal(screen.commitments[0].amountMinor,30000);
  assert.equal(screen.commitments[2].amountMinor,12132);
  assert.equal(screen.commitments[10].description,'Carro');
  assert.equal(screen.commitments[10].amountMinor,130000);
  assert.equal(screen.commitments.at(-1).description,'Davi');
  assert.equal(screen.commitments.at(-1).dueDay,null);
  assert.equal(screen.commitments.at(-1).recurring,true);
});

test('does not reinterpret arbitrary lists as recurring bills without a recurring heading',()=>{
  assert.equal(parseRecurringCommitmentsFromOcr('Studio Z 5 300\nInternet 20 166'),null);
});


test('recognizes recurring bills when OCR splits each table cell onto its own line',()=>{
  const screen=parseRecurringCommitmentsFromOcr(`
Débitos recorrentes
Débito
Data
Valor
Studio Z
5
300
Cartão MP
5
262
Itaú
8
121,32
Internet vivo
20
166
Carro
20
1.300
Davi
250
Vencimentos:
`);
  assert.ok(screen);
  assert.equal(screen.commitments.length,6);
  assert.deepEqual(
    screen.commitments.map(item=>[item.description,item.dueDay,item.amountMinor]),
    [
      ['Studio Z',5,30000],
      ['Cartão MP',5,26200],
      ['Itaú',8,12132],
      ['Internet vivo',20,16600],
      ['Carro',20,130000],
      ['Davi',null,25000]
    ]
  );
});
