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
