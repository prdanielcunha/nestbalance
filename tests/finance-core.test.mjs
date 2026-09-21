import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFingerprint, fingerprintForInterpretation, probableDuplicateScore } from '../.core-dist/core/fingerprint.js';
import { deriveHomeSnapshot } from '../.core-dist/core/summary.js';
import { remainingInstallments } from '../.core-dist/core/installments.js';
import { parseFinancialText } from '../.core-dist/core/text-parser.js';

test('fingerprint externo vence heurística', () => {
  assert.equal(canonicalFingerprint({amountMinor:100, externalId:'E2E-123'}), 'ext:e2e123');
});

test('transações iguais em dias diferentes não colidem', () => {
  const i = parseFinancialText('paguei 50 mercado');
  assert.notEqual(fingerprintForInterpretation(i,'2026-09-20'), fingerprintForInterpretation(i,'2026-09-21'));
});

test('compromisso recorrente idêntico mantém fingerprint estável', () => {
  const i = parseFinancialText('Internet 119 dia 10 todo mês');
  assert.equal(fingerprintForInterpretation(i,'2026-09-20'), fingerprintForInterpretation(i,'2026-10-20'));
});

test('dedup alcança confiança alta para mesmos sinais', () => {
  const a = { amountMinor: 11990, date: '2026-09-20', description: 'Vivo Fibra', counterparty: 'Telefonica' };
  const b = { amountMinor: 11990, date: '2026-09-20', description: 'Vivo Fibra', counterparty: 'Telefonica' };
  assert.ok(probableDuplicateScore(a,b) >= 0.9);
});

test('home calcula quanto deve sobrar', () => {
  const s = deriveHomeSnapshot({ availableMinor: 482000, incomeMinor: 0, paidExpenseMinor: 0, futureCommitmentsMinor: 128600, dueSoonMinor: 128600 });
  assert.equal(s.projectedRemainderMinor, 353400);
});

test('parcelas restantes não contam a atual', () => {
  assert.equal(remainingInstallments(5,12), 7);
});
