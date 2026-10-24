import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFinancialScreenshot as read} from '../.core-dist/core/financial-screenshot.js';

test('account home separates balance from navigation, offers and score',()=>{
 const r=read('Olá Daniel\nSaldo Cofrinhos Investimentos Cripto\nR$ 0 09\nDeposite mais R$ 970\nMeli Dólar\nEmpréstimos\nR$ 340\nScore de crédito 783');
 assert.equal(r.kind,'account_home');
 assert.equal(r.screen?.institution,'Mercado Pago');
 assert.equal(r.screen?.accounts[0].balanceMinor,9);
 assert.deepEqual(r.screen?.pots,[]);
 assert.deepEqual(r.screen?.movements,[]);
});
test('unreadable home never promotes ads into pots or transactions',()=>{
 const r=read('Saldo\nCofrinhos\nInvestimentos\nCripto\nR$ o°\nDeposite mais R$ 970\nEmpréstimos\nR$ 340');
 assert.equal(r.kind,'account_home'); assert.equal(r.screen,null);
});
test('Pix receipt selects transaction amount and ignores later balance',()=>{
 const r=read('Comprovante Pix enviado\nValor R$ 150,00\n24/10/2026\nSaldo disponível\nR$ 900,00');
 assert.equal(r.kind,'single_event');
 assert.equal(r.screen?.accounts.length,0);
 assert.equal(r.screen?.movements[0].amountMinor,15000);
 assert.equal(r.screen?.movements[0].direction,'expense');
 assert.equal(r.screen?.movements[0].dateIso,'2026-10-24');
});
test('received Pix is income',()=>{
 assert.equal(read('Pix recebido\nValor R$ 72,90').screen?.movements[0].direction,'income');
});
test('payment receipt without direction asks for direction',()=>{
 const r=read('Comprovante de Pix\nValor R$ 72,90');
 assert.equal(r.screen?.movements[0].direction,'unknown');
 assert.equal(r.screen?.movements[0].needsReview,true);
});
for(const state of ['agendado','pendente','cancelado','não concluído','estornado']){
 test(`does not mark an operation ${state} as completed`,()=>{
  assert.equal(read(`Comprovante Pix enviado ${state}\nValor R$ 150,00`).screen,null);
 });
}
test('credit limits and statement total stay on the card',()=>{
 const r=read('Nubank\nFatura atual R$ 320,00\nVencimento 10/11/2026\nLimite disponível R$ 2.000,00\nLimite total R$ 5.000,00');
 assert.equal(r.kind,'card_statement');
 assert.equal(r.screen?.cards[0].statementAmountMinor,32000);
 assert.equal(r.screen?.cards[0].availableLimitMinor,200000);
 assert.equal(r.screen?.cards[0].dueOn,'2026-11-10');
 assert.deepEqual(r.screen?.movements,[]);
});
test('unpaid boleto creates a commitment proposal',()=>{
 const r=read('Boleto internet\nVencimento 10/11/2026\nValor do documento R$ 129,90');
 assert.equal(r.kind,'bill');
 assert.equal(r.screen?.commitments[0].amountMinor,12990);
 assert.deepEqual(r.screen?.movements,[]);
});
test('several pots are distinct from expenses',()=>{
 const r=read('Mercado Pago\nCofrinhos\nViagem R$ 150,00\nEmergência R$ 350,00');
 assert.equal(r.kind,'savings_pots');
 assert.equal(r.screen?.pots.length,2);
 assert.deepEqual(r.screen?.movements,[]);
});
test('history with a balance produces separate records',()=>{
 const r=read('Nubank\nSaldo disponível\nR$ 500,00\nExtrato\n24/10/2026\nPix recebido R$ 200,00\nCompra paga R$ 50,00');
 assert.equal(r.kind,'mixed');
 assert.equal(r.screen?.accounts[0].balanceMinor,50000);
 assert.equal(r.screen?.movements.length,2);
});
test('history handles dated, signed values and ignores offers',()=>{
 const r=read('Extrato\n24/10/2026\nPadaria - R$ 32,50\nSalário + R$ 900,00\nOferta de empréstimo R$ 5.000,00');
 assert.equal(r.kind,'transaction_list');
 assert.equal(r.screen?.movements.length,2);
 assert.equal(r.screen?.movements[0].direction,'expense');
 assert.equal(r.screen?.movements[1].direction,'income');
});
test('ambiguous amounts never become a fabricated transaction',()=>{
 const r=read('Comprovante\nR$ 40,00\nR$ 50,00');
 assert.equal(r.screen,null);
});
test('nonfinancial screenshots are not promoted to expenses',()=>{
 for(const value of ['Promoção\nR$ 19,90','Meu relógio 16:34\nBateria 66%','Saldo oculto\nLimite disponível R$ 500,00','']){
  const r=read(value); assert.equal(r.screen?.movements.length||0,0);
 }
});
