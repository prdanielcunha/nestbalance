import test from 'node:test';
import assert from 'node:assert/strict';
import { answerAssistantQuestion, classifyAssistantIntent } from '../.core-dist/core/assistant.js';

const base={
  accounts:[{id:'a1',name:'Conta principal',balanceMinor:200000,status:'active'}],
  commitments:[{id:'c1',description:'Internet',amountMinor:11990,status:'pending',recurring:true,recurrence:'monthly'}],
  invoices:[
    {id:'i1',cardId:'card-1',invoiceKey:'2026-09',dueOn:'2026-09-25',status:'confirmed',confirmedAmountMinor:50000,paidAmountMinor:0,paymentStatus:'unpaid'},
    {id:'i2',cardId:'card-2',invoiceKey:'2026-09',dueOn:'2026-09-28',status:'partial',confirmedAmountMinor:10000,paidAmountMinor:0,paymentStatus:'unpaid'}
  ],
  installmentPlans:[
    {id:'p1',description:'Notebook',amountMinor:30000,status:'active',totalInstallments:10,lastObservedInstallment:4,anchorDueOn:'2026-09-25'}
  ],
  now:new Date(2026,8,21)
};

test('classifica pergunta humana sobre o que falta pagar',()=>{
  assert.equal(classifyAssistantIntent('Quanto ainda falta pagar?'),'remaining_to_pay');
  assert.equal(classifyAssistantIntent('Tem contas pendentes?'),'remaining_to_pay');
});

test('responde quanto falta pagar sem somar fatura paga',()=>{
  const answer=answerAssistantQuestion({
    ...base,
    question:'Quanto ainda falta pagar?',
    invoices:[...base.invoices,{id:'paid',cardId:'x',invoiceKey:'2026-08',dueOn:'2026-08-20',status:'confirmed',confirmedAmountMinor:99999,paidAmountMinor:99999,paymentStatus:'paid'}]
  });
  assert.equal(answer.intent,'remaining_to_pay');
  assert.equal(answer.answerMinor,71990);
  assert.equal(answer.sources.length,3);
  assert.match(answer.summary,/pode aumentar/);
});

test('saldo disponível vem só das contas conhecidas',()=>{
  const answer=answerAssistantQuestion({...base,question:'Quanto tenho disponível?'});
  assert.equal(answer.intent,'available_now');
  assert.equal(answer.answerMinor,200000);
});

test('próximos meses usam planos reconciliados e recorrências',()=>{
  const answer=answerAssistantQuestion({...base,question:'O que já está comprometido nos próximos meses?'});
  assert.equal(answer.intent,'future_months');
  assert.deepEqual(answer.cards.map(card=>card.amountMinor),[41990,41990,41990]);
});

test('pergunta fora da camada atual não inventa resposta',()=>{
  const answer=answerAssistantQuestion({...base,question:'Onde devo investir meu dinheiro?'});
  assert.equal(answer.intent,'unsupported');
  assert.equal(answer.answerMinor,null);
  assert.equal(answer.sources.length,0);
});
