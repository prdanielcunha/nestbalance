import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFinancialText } from '../.core-dist/core/text-parser.js';
import { matchPayableCommitments } from '../.core-dist/core/commitment-payments.js';
import { parseInvoiceText } from '../.core-dist/core/invoices.js';
import { answerAssistantQuestion } from '../.core-dist/core/assistant.js';
import { searchVaultDocuments } from '../.core-dist/core/vault-search.js';
import { parseSavingsPotsFromOcr } from '../.core-dist/core/savings-pot-import.js';

/**
 * Product-level contract for the mandatory NestBalance demo moments.
 *
 * These tests intentionally exercise deterministic core behavior. They do not
 * claim to cover browser authentication, camera/OCR transport, audio capture,
 * Firestore persistence, or evidence upload plumbing; those belong to
 * integration/E2E gates.
 */

test('demo contract 1: a Pix/payment capture can identify the correct known commitment',()=>{
  const capture=parseFinancialText('paguei 119,90 da internet Vivo no Pix');
  assert.equal(capture.kind,'transaction');
  assert.equal(capture.direction,'expense');
  assert.equal(capture.money.amountMinor,11990);

  const matches=matchPayableCommitments(
    {amountMinor:capture.money.amountMinor,description:capture.description,observedOn:'2026-09-10'},
    [
      {id:'internet-vivo',description:'Internet Vivo',amountMinor:11990,status:'pending',recurring:true,recurrence:'monthly',dueDay:10},
      {id:'academia',description:'Academia',amountMinor:12990,status:'pending',recurring:true,recurrence:'monthly',dueDay:10}
    ]
  );

  assert.equal(matches[0]?.commitment.id,'internet-vivo');
  assert.ok(matches[0]?.reasons.includes('same_amount'));
  assert.ok(matches[0]?.reasons.includes('similar_name'));
});

test('demo contract 2: a card statement preserves installments and future commitment without counting statement payment as purchase',()=>{
  const preview=parseInvoiceText({
    text:[
      'Vencimento 14/09/2026',
      '05/09 MERCADO CENTRAL 129,90',
      '06/09 LOJA XPTO PARC 03/10 89,90',
      'PAGAMENTO DA FATURA 500,00',
      'TOTAL DA FATURA 719,80'
    ].join('\n'),
    closingDay:7,
    dueDay:14,
    referenceDate:'2026-09-10'
  });

  assert.equal(preview.dueOn,'2026-09-14');
  assert.equal(preview.items.length,2);
  const installment=preview.items.find(item=>item.installment);
  assert.ok(installment);
  assert.deepEqual(installment.installment,{current:3,total:10});
  assert.equal(installment.schedule.length,8);
  assert.equal(installment.schedule[0].dueOn,'2026-09-14');
  assert.equal(installment.schedule.at(-1).dueOn,'2027-04-14');
  assert.equal(preview.futureInstallmentsMinor,62930);
  assert.equal(preview.items.some(item=>/pagamento da fatura/i.test(item.description)),false);
});

test('demo contract 3: an audio-like phrase becomes a paid-water candidate without inventing certainty',()=>{
  const transcript=parseFinancialText('paguei 186 da água');
  assert.equal(transcript.kind,'transaction');
  assert.equal(transcript.direction,'expense');
  assert.equal(transcript.money.amountMinor,18600);

  const matches=matchPayableCommitments(
    {amountMinor:transcript.money.amountMinor,description:transcript.description,observedOn:'2026-09-18'},
    [
      {id:'agua',description:'Água',amountMinor:18600,status:'pending',recurring:true,recurrence:'monthly',dueDay:18},
      {id:'energia',description:'Energia',amountMinor:20500,status:'pending',recurring:true,recurrence:'monthly',dueDay:18}
    ]
  );

  assert.equal(matches[0]?.commitment.id,'agua');
  assert.ok(matches[0]?.score>=82);
});

test('demo contract 4: the assistant answers remaining-to-pay from known obligations and exposes sources',()=>{
  const answer=answerAssistantQuestion({
    locale:'pt-BR',
    question:'Quanto ainda falta pagar?',
    accounts:[{id:'a1',name:'Conta principal',balanceMinor:250000,status:'active'}],
    transactions:[],
    commitments:[
      {id:'internet',description:'Internet',amountMinor:11990,status:'pending',recurring:true,recurrence:'monthly'},
      {id:'agua',description:'Água',amountMinor:18600,status:'pending',recurring:true,recurrence:'monthly'}
    ],
    invoices:[
      {id:'fatura',cardId:'card-1',invoiceKey:'2026-09',dueOn:'2026-09-25',status:'confirmed',confirmedAmountMinor:50000,paidAmountMinor:0,paymentStatus:'unpaid'}
    ],
    installmentPlans:[],
    now:new Date(2026,8,21)
  });

  assert.equal(answer.intent,'remaining_to_pay');
  assert.equal(answer.answerMinor,80590);
  assert.ok(answer.sources.length>=3);
  assert.equal(answer.sources.reduce((sum,item)=>sum+item.amountMinor,0),80590);
});

test('demo contract 5: natural-language evidence search finds the remembered internet receipt by month',()=>{
  const docs=[
    {
      evidenceId:'internet-mar',
      originalName:'comprovante-internet.pdf',
      createdAtMs:new Date('2026-03-11T12:00:00Z').getTime(),
      description:'Internet residencial',
      payee:'Vivo',
      amountMinor:11990,
      dateIso:'2026-03-10',
      summary:'Pagamento da internet do Lar'
    },
    {
      evidenceId:'internet-abr',
      originalName:'comprovante-internet-abril.pdf',
      createdAtMs:new Date('2026-04-11T12:00:00Z').getTime(),
      description:'Internet residencial',
      payee:'Vivo',
      amountMinor:11990,
      dateIso:'2026-04-10',
      summary:'Pagamento da internet do Lar'
    },
    {
      evidenceId:'energia-mar',
      originalName:'comprovante-energia.pdf',
      createdAtMs:new Date('2026-03-12T12:00:00Z').getTime(),
      description:'Energia elétrica',
      payee:'Copel',
      amountMinor:21000,
      dateIso:'2026-03-12'
    }
  ];

  const hits=searchVaultDocuments('comprovante da internet de março',docs);
  assert.equal(hits[0]?.evidenceId,'internet-mar');
  assert.ok(hits[0]?.score>0);
});


test('demo contract 6: a savings-pots screenshot becomes structured goals without creating expenses',()=>{
  const screen=parseSavingsPotsFromOcr([
    'Cofrinhos',
    'Meli+',
    'Seus cofrinhos',
    'Aniversário Davi',
    'R$ 1.015,68',
    'Meta: R$ 2.550',
    'Reservas',
    'R$ 300,82'
  ].join('\n'));

  assert.ok(screen);
  assert.equal(screen.screenType,'savings_pots');
  assert.equal(screen.institution,'Mercado Pago');
  assert.equal(screen.pots.length,2);
  assert.equal(screen.pots[0].balanceMinor,101568);
  assert.equal(screen.pots[0].goalMinor,255000);
  assert.equal(screen.movements.length,0);
  assert.equal(screen.commitments.length,0);
});
