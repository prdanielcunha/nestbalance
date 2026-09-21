import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFinancialCsv } from '../.core-dist/core/csv-import.js';

test('CSV estruturado importa créditos e débitos sem formulário',()=>{
  const csv='Data;Descrição;Valor;Tipo\n20/09/2026;Padaria;18,90;Débito\n19/09/2026;Salário;2500,00;Crédito';
  const result=parseFinancialCsv(csv);
  assert.equal(result.state,'parsed');
  assert.equal(result.items.length,2);
  assert.equal(result.items[0].direction,'expense');
  assert.equal(result.items[0].occurredOn,'2026-09-20');
  assert.equal(result.items[1].direction,'income');
});

test('CSV com colunas crédito e débito resolve direção com segurança',()=>{
  const csv='data;historico;credito;debito\n2026-09-20;Pix recebido;120,00;\n2026-09-20;Mercado;;54,90';
  const result=parseFinancialCsv(csv);
  assert.equal(result.state,'parsed');
  assert.deepEqual(result.items.map(item=>item.direction),['income','expense']);
});

test('CSV sem direção deixa apenas essa pergunta para revisão',()=>{
  const csv='Data;Descrição;Valor\n20/09/2026;Loja;50,00';
  const result=parseFinancialCsv(csv);
  assert.equal(result.state,'parsed');
  assert.ok(result.items[0].needsReview.includes('direction'));
});

test('formato desconhecido não é chutado',()=>{
  const csv='foo;bar\na;b';
  assert.deepEqual(parseFinancialCsv(csv),{state:'unsupported',reason:'required_columns_not_found'});
});


test('CSV rejeita data impossível e pede conferência em vez de mudar o dia',()=>{
  const csv='Data;Descrição;Valor;Tipo\n31/02/2026;Loja;50,00;Débito';
  const result=parseFinancialCsv(csv);
  assert.equal(result.state,'parsed');
  assert.equal(result.items[0].occurredOn,undefined);
  assert.ok(result.items[0].needsReview.includes('date'));
});
