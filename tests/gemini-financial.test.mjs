import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeGeminiFinancialExtraction } from '../.core-dist/core/gemini-financial.js';

test('accepts only amounts and dates grounded in OCR text',()=>{
  const text='Nubank\nCompra mercado R$ 119,90\n21/09/2026';
  const extraction=sanitizeGeminiFinancialExtraction({
    documentType:'bank_screenshot',
    description:'Mercado',
    descriptionConfidence:0.95,
    amountMinor:11990,
    amountConfidence:0.96,
    amountCandidatesMinor:[11990,99999],
    direction:'expense',
    directionConfidence:0.95,
    dateIso:'2026-09-21',
    institution:'Nubank',
    overallConfidence:0.94,
    needsConfirmation:false,
    ambiguities:[],
    evidenceSummary:'Compra no mercado'
  },text);
  assert.equal(extraction.amountMinor,11990);
  assert.deepEqual(extraction.amountCandidatesMinor,[11990]);
  assert.equal(extraction.dateIso,'2026-09-21');
  assert.equal(extraction.needsConfirmation,false);
});

test('rejects hallucinated monetary value and forces confirmation',()=>{
  const text='Compra R$ 19,90';
  const extraction=sanitizeGeminiFinancialExtraction({
    documentType:'receipt',
    description:'Compra',
    descriptionConfidence:0.9,
    amountMinor:199000,
    amountConfidence:0.99,
    direction:'expense',
    directionConfidence:0.99,
    overallConfidence:0.99,
    needsConfirmation:false
  },text);
  assert.equal(extraction.amountMinor,null);
  assert.equal(extraction.amountConfidence,0);
  assert.equal(extraction.needsConfirmation,true);
});

test('rejects card last4 that is not visible in OCR text',()=>{
  const text='Nubank cartão final 4321 limite R$ 1.000,00';
  const extraction=sanitizeGeminiFinancialExtraction({
    documentType:'bank_screenshot',
    amountMinor:100000,
    amountConfidence:0.9,
    direction:'unknown',
    directionConfidence:0.4,
    overallConfidence:0.8,
    screen:{
      screenType:'card_home',
      institution:'Nubank',
      accounts:[],
      pots:[],
      cards:[
        {name:'Nubank',last4:'9999',statementAmountMinor:null,dueOn:null,availableLimitMinor:null,totalLimitMinor:100000,confidence:0.9},
        {name:'Nubank',last4:'4321',statementAmountMinor:null,dueOn:null,availableLimitMinor:null,totalLimitMinor:100000,confidence:0.9}
      ],
      commitments:[],
      movements:[],
      summary:'Cartão'
    }
  },text);
  assert.equal(extraction.screen?.cards[0]?.last4,null);
  assert.equal(extraction.screen?.cards[1]?.last4,'4321');
  assert.equal(extraction.screen?.institution,'Nubank');
});

test('preserves installment only when visible in OCR',()=>{
  const text='Geladeira R$ 189,00 parcela 3/10';
  const extraction=sanitizeGeminiFinancialExtraction({
    documentType:'bank_screenshot',
    amountMinor:18900,
    amountConfidence:0.95,
    direction:'expense',
    directionConfidence:0.95,
    overallConfidence:0.9,
    screen:{
      screenType:'mixed',
      institution:null,
      accounts:[],
      pots:[],
      cards:[],
      commitments:[
        {description:'Geladeira',amountMinor:18900,dueOn:null,installment:{current:3,total:10},confidence:0.9,needsReview:false}
      ],
      movements:[],
      summary:'Parcelamento'
    }
  },text);
  assert.deepEqual(extraction.screen?.commitments[0]?.installment,{current:3,total:10});
});

test('screen snapshot keeps only grounded balances and movements',()=>{
  const text='Saldo disponível R$ 1.250,00\nPadaria R$ 32,50\n21/09/2026';
  const extraction=sanitizeGeminiFinancialExtraction({
    documentType:'bank_screenshot',
    amountMinor:3250,
    amountConfidence:0.9,
    direction:'expense',
    directionConfidence:0.9,
    overallConfidence:0.9,
    screen:{
      screenType:'account_home',
      institution:'Banco',
      accounts:[{name:'Conta',productType:'account',balanceMinor:125000,currency:'BRL',confidence:0.9}],
      pots:[],
      cards:[],
      commitments:[],
      movements:[
        {description:'Padaria',amountMinor:3250,direction:'expense',dateIso:'2026-09-21',confidence:0.9,needsReview:false,visibleText:'Padaria R$ 32,50'},
        {description:'Inventado',amountMinor:99900,direction:'expense',confidence:0.99,needsReview:false}
      ],
      summary:'Tela bancária'
    }
  },text);
  assert.equal(extraction.screen?.accounts[0]?.balanceMinor,125000);
  assert.equal(extraction.screen?.movements.length,1);
  assert.equal(extraction.screen?.movements[0]?.amountMinor,3250);
});
