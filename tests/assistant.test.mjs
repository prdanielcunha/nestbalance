import test from 'node:test';
import assert from 'node:assert/strict';
import { answerAssistantQuestion, assistantEvidenceQuery, classifyAssistantIntent } from '../.core-dist/core/assistant.js';

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

test('classifica perguntas humanas suportadas',()=>{
  assert.equal(classifyAssistantIntent('Quanto ainda falta pagar?'),'remaining_to_pay');
  assert.equal(classifyAssistantIntent('Tem contas pendentes?'),'remaining_to_pay');
  assert.equal(classifyAssistantIntent('Dá para gastar R$ 500?'),'spending_simulation');
  assert.equal(classifyAssistantIntent('Se eu gastar 350 reais, como fica?'),'spending_simulation');
  assert.equal(classifyAssistantIntent('Quais parcelas terminam logo?'),'ending_installments');
  assert.equal(classifyAssistantIntent('Ache o comprovante do IPTU'),'evidence_lookup');
  assert.equal(classifyAssistantIntent('Onde está meu recibo da luz?'),'evidence_lookup');
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

test('limpa linguagem de busca de comprovante antes de consultar o Cofre',()=>{
  assert.equal(assistantEvidenceQuery('Ache o comprovante do IPTU'),'iptu');
  assert.equal(assistantEvidenceQuery('Onde está meu recibo da luz de setembro?'),'luz setembro');
});

test('responde busca de evidência somente com resultados do Cofre',()=>{
  const found=answerAssistantQuestion({
    ...base,
    question:'Ache o comprovante do IPTU',
    evidenceMatches:[{id:'ev1',label:'comprovante.pdf',detail:'IPTU apartamento · Março'}]
  });
  assert.equal(found.intent,'evidence_lookup');
  assert.equal(found.answerMinor,null);
  assert.equal(found.sources.length,1);
  assert.equal(found.sources[0].kind,'evidence');
  assert.equal(found.sources[0].id,'ev1');

  const missing=answerAssistantQuestion({...base,question:'Ache o comprovante do seguro',evidenceMatches:[]});
  assert.equal(missing.intent,'evidence_lookup');
  assert.match(missing.title,/Não encontrei/);
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
