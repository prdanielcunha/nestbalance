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

test('vencimento sozinho não vira recorrência mensal silenciosamente', () => {
  const result = parseFinancialText('IPTU 2850 dia 10');
  assert.equal(result.kind, 'commitment');
  assert.equal(result.recurring, false);
  assert.equal(result.needsReview.includes('recurrence'), true);
});

test('transferência não entra como despesa nem renda', () => {
  const result = parseFinancialText('transferi 850 entre minhas contas');
  assert.equal(result.kind, 'transaction');
  assert.equal(result.money.amountMinor, 85000);
  assert.equal(result.direction, 'transfer');
  assert.equal(result.needsReview.includes('direction'), false);
});

test('interpreta compromisso em inglês com formato numérico internacional',()=>{
  const result=parseFinancialText('paid 1,250.50 for internet every month due day 10');
  assert.equal(result.kind,'commitment');
  assert.equal(result.money.amountMinor,125050);
  assert.equal(result.direction,'expense');
  assert.equal(result.dueDay,10);
  assert.equal(result.recurring,true);
  assert.equal(result.needsReview.includes('direction'),false);
});

test('interpreta renda em espanhol com acento e formato 1.234,56',()=>{
  const result=parseFinancialText('recibí 2.500,00 de salario');
  assert.equal(result.kind,'transaction');
  assert.equal(result.money.amountMinor,250000);
  assert.equal(result.direction,'income');
  assert.equal(result.needsReview.includes('direction'),false);
});

test('interpreta recorrência e vencimento em espanhol',()=>{
  const result=parseFinancialText('Internet 119,90 cada mes vence el 10');
  assert.equal(result.kind,'commitment');
  assert.equal(result.money.amountMinor,11990);
  assert.equal(result.dueDay,10);
  assert.equal(result.recurring,true);
});

test('interpreta transferência em inglês e espanhol sem virar despesa',()=>{
  const english=parseFinancialText('transferred 850 between my accounts');
  const spanish=parseFinancialText('transferí 850 entre mis cuentas');
  assert.equal(english.direction,'transfer');
  assert.equal(spanish.direction,'transfer');
  assert.equal(english.needsReview.includes('direction'),false);
  assert.equal(spanish.needsReview.includes('direction'),false);
});



test('valor inteiro com separador de milhar brasileiro não perde um dígito',()=>{
  const result=parseFinancialText('paguei R$ 1.250 da escola');
  assert.equal(result.money.amountMinor,125000);
  assert.equal(result.description,'da escola');
});

test('OCR com espaço no milhar continua preservando centavos',()=>{
  const result=parseFinancialText('paguei R$ 1 250,50 no mercado');
  assert.equal(result.money.amountMinor,125050);
});

test('data e hora antes do valor não são confundidas com dinheiro',()=>{
  const result=parseFinancialText('paguei 05/09 às 14:32 mercado R$ 100,00');
  assert.equal(result.money.amountMinor,10000);
  assert.equal(result.installment,undefined);
  assert.match(result.description,/mercado/i);
});

test('dia de vencimento sem valor não vira R$ 10 silenciosamente',()=>{
  const result=parseFinancialText('Internet dia 10 todo mês');
  assert.equal(result.money.amountMinor,0);
  assert.equal(result.dueDay,10);
  assert.ok(result.needsReview.includes('amount'));
  assert.ok(result.needsReview.includes('amount_positive'));
});


test('data curta depois do valor com contexto de data não vira parcela',()=>{
  const result=parseFinancialText('paguei R$ 100,00 no mercado em 05/09');
  assert.equal(result.money.amountMinor,10000);
  assert.equal(result.installment,undefined);
});
