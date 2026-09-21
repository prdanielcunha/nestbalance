import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFinancialText, parseFinancialList } from '../.core-dist/core/text-parser.js';

test('interpreta conta recorrente em linguagem comum', () => {
  const result = parseFinancialText('Internet 119,90 dia 10 todo mês');
  assert.equal(result.kind, 'commitment');
  assert.equal(result.description, 'Internet');
  assert.equal(result.money.amountMinor, 11990);
  assert.equal(result.dueDay, 10);
  assert.equal(result.recurring, true);
  assert.equal(result.confidence, 'high');
});

test('interpreta pagamento simples', () => {
  const result = parseFinancialText('paguei 186 da água');
  assert.equal(result.kind, 'transaction');
  assert.equal(result.money.amountMinor, 18600);
  assert.equal(result.direction, 'expense');
});

test('reconhece parcela', () => {
  const result = parseFinancialText('Magalu 300 5/12');
  assert.deepEqual(result.installment, { current: 5, total: 12 });
});

test('converte lista de bloco de notas em vários itens', () => {
  const items = parseFinancialList('Internet 119 dia 10\nCarro 1286 dia 18\nEscola 780 dia 25');
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(x => x.dueDay), [10,18,25]);
  assert.deepEqual(items.map(x => x.money.amountMinor), [11900,128600,78000]);
});
