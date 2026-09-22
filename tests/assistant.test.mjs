import test from 'node:test';
import assert from 'node:assert/strict';
import { answerAssistantQuestion, classifyAssistantIntent } from '../.core-dist/core/assistant.js';

const base={
  accounts:[{id:'a1',name:'Conta principal',balanceMinor:200000,status:'active'}],
  transactions:[
    {id:'aug-market',description:'Supermercado',amountMinor:30000,direction:'expense',observedOn:'2026-08-10'},
    {id:'aug-energy',description:'Energia',amountMinor:10000,direction:'expense',observedOn:'2026-08-12'},
    {id:'jul-energy',description:'Energia',amountMinor:9500,direction:'expense',observedOn:'2026-07-12'},
    {id:'jun-energy',description:'Energia',amountMinor:10500,direction:'expense',observedOn:'2026-06-12'},
    {id:'sep-market',description:'Supermercado',amountMinor:52000,direction:'expense',observedOn:'2026-09-10'},
    {id:'sep-energy',description:'Energia',amountMinor:18000,direction:'expense',observedOn:'2026-09-12'}
  ],
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

test('classifica perguntas humanas suportadas',()=>{
  assert.equal(classifyAssistantIntent('Quanto ainda falta pagar?'),'remaining_to_pay');
  assert.equal(classifyAssistantIntent('Tem contas pendentes?'),'remaining_to_pay');
  assert.equal(classifyAssistantIntent('Dá para gastar R$ 500?'),'spending_simulation');
  assert.equal(classifyAssistantIntent('Se eu gastar 350 reais, como fica?'),'spending_simulation');
  assert.equal(classifyAssistantIntent('Quais parcelas terminam logo?'),'ending_installments');
  assert.equal(classifyAssistantIntent('Por que gastei mais este mês?'),'spending_change');
  assert.equal(classifyAssistantIntent('O que está estranho?'),'anomalies');
  assert.equal(classifyAssistantIntent('How much is still left to pay?'),'remaining_to_pay');
  assert.equal(classifyAssistantIntent('Can I spend R$ 500?'),'spending_simulation');
  assert.equal(classifyAssistantIntent('Why did I spend more this month?'),'spending_change');
  assert.equal(classifyAssistantIntent('What looks unusual?'),'anomalies');
  assert.equal(classifyAssistantIntent('¿Cuánto falta pagar?'),'remaining_to_pay');
  assert.equal(classifyAssistantIntent('¿Puedo gastar R$ 500?'),'spending_simulation');
  assert.equal(classifyAssistantIntent('¿Qué cuotas terminan pronto?'),'ending_installments');
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

test('simula gasto com saldo menos obrigações conhecidas',()=>{
  const answer=answerAssistantQuestion({...base,question:'Dá para gastar R$ 500?'});
  assert.equal(answer.intent,'spending_simulation');
  assert.equal(answer.answerMinor,78010);
  assert.deepEqual(answer.cards.map(card=>card.amountMinor),[200000,71990,50000,78010]);
  assert.match(answer.summary,/não uma recomendação de gasto/);
  assert.match(answer.summary,/fatura ainda em revisão/);
});

test('simulação aceita valor em linguagem comum e pede valor quando faltar',()=>{
  const plain=answerAssistantQuestion({...base,question:'Se eu gastar 350 reais, como fica?'});
  assert.equal(plain.answerMinor,93010);

  const missing=answerAssistantQuestion({...base,question:'Posso gastar?'});
  assert.equal(missing.intent,'spending_simulation');
  assert.equal(missing.answerMinor,null);
  assert.match(missing.title,/Qual valor/);
});

test('mostra parcelas que terminam primeiro e valor mensal liberado',()=>{
  const answer=answerAssistantQuestion({
    ...base,
    question:'Quais parcelas terminam logo?',
    installmentPlans:[
      ...base.installmentPlans,
      {id:'p2',description:'Celular',amountMinor:15000,status:'active',totalInstallments:10,lastObservedInstallment:8,anchorDueOn:'2026-09-10'},
      {id:'p3',description:'Curso',amountMinor:9000,status:'active',totalInstallments:6,lastObservedInstallment:5,anchorDueOn:'2026-09-15'}
    ]
  });
  assert.equal(answer.intent,'ending_installments');
  assert.equal(answer.answerMinor,24000);
  assert.deepEqual(answer.cards.slice(0,3).map(card=>card.label),['Curso','Celular','Notebook']);
  assert.match(answer.summary,/24.000|240,00|R\$/);
  assert.match(answer.sources[0].detail,/Falta 1 parcela/);
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


test('explica por que o gasto mudou usando comparação real entre meses',()=>{
  const answer=answerAssistantQuestion({...base,question:'Por que gastei mais este mês?'});
  assert.equal(answer.intent,'spending_change');
  assert.equal(answer.answerMinor,30000);
  assert.match(answer.title,/a mais/);
  assert.match(answer.summary,/ignora transferências/);
  assert.equal(answer.cards.some(card=>card.label==='Alimentação'),true);
});

test('aponta anomalias como sinais e não como acusações',()=>{
  const answer=answerAssistantQuestion({
    ...base,
    question:'O que está estranho?',
    transactions:[
      ...base.transactions,
      {id:'dup1',description:'Padaria',amountMinor:5000,direction:'expense',observedOn:'2026-09-18'},
      {id:'dup2',description:'Padaria',amountMinor:5000,direction:'expense',observedOn:'2026-09-18'}
    ]
  });
  assert.equal(answer.intent,'anomalies');
  assert.match(answer.summary,/sinais, não acusações/i);
  assert.equal(answer.sources.some(source=>source.label==='Padaria'),true);
});


test('responde em inglês quando o idioma confiável do Lar é inglês',()=>{
  const answer=answerAssistantQuestion({...base,locale:'en',question:'Why did I spend more this month?'});
  assert.equal(answer.intent,'spending_change');
  assert.match(answer.title,/You spent/);
  assert.match(answer.summary,/comparison ignores/i);
  assert.equal(answer.cards.some(card=>card.label==='Food'),true);
  assert.equal(answer.suggestions.some(value=>/What looks unusual/i.test(value)),true);
});

test('responde em espanhol quando o idioma confiável do Lar é espanhol',()=>{
  const answer=answerAssistantQuestion({...base,locale:'es',question:'¿Cuánto falta pagar?'});
  assert.equal(answer.intent,'remaining_to_pay');
  assert.equal(answer.answerMinor,71990);
  assert.match(answer.title,/Todavía hay valores/i);
  assert.equal(answer.cards.some(card=>card.label==='Resúmenes abiertos'),true);
});

test('simulação em inglês aceita separadores internacionais sem perder centavos',()=>{
  const answer=answerAssistantQuestion({...base,locale:'en',question:'Can I spend R$ 1,250.50?'});
  assert.equal(answer.intent,'spending_simulation');
  assert.equal(answer.answerMinor,2960);
  assert.match(answer.summary,/simulation, not a spending recommendation/i);
});

test('pergunta não suportada mantém transparência no idioma do Lar',()=>{
  const english=answerAssistantQuestion({...base,locale:'en',question:'Where should I invest?'});
  const spanish=answerAssistantQuestion({...base,locale:'es',question:'¿Dónde debo invertir?'});
  assert.equal(english.intent,'unsupported');
  assert.match(english.title,/I can answer/i);
  assert.equal(spanish.intent,'unsupported');
  assert.match(spanish.title,/Puedo responder/i);
});
