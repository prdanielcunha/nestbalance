import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiAmountChoices,
  aiDirectionNeedsConfirmation,
  aiExtractionNeedsReview,
  sourceTextFromAiExtraction
} from '../.core-dist/core/ai-financial.js';

function extraction(overrides={}){
  return {
    documentType:'pix_receipt',
    description:'Internet',
    descriptionConfidence:0.95,
    amountMinor:11990,
    amountConfidence:0.96,
    amountCandidatesMinor:[11990],
    direction:'expense',
    directionConfidence:0.94,
    dateIso:'2026-09-20',
    time:'18:30',
    merchant:null,
    payer:null,
    payee:'Vivo',
    institution:'Banco',
    paymentMethod:'pix',
    transactionId:null,
    pixE2e:null,
    installment:null,
    recurringLikely:null,
    subscriptionLikely:null,
    overallConfidence:0.94,
    needsConfirmation:false,
    ambiguities:[],
    evidenceSummary:'Comprovante Pix de internet',
    ...overrides
  };
}

test('extração visual clara vira texto revisável, não lançamento direto',()=>{
  const source=sourceTextFromAiExtraction(extraction());
  assert.equal(source,'paguei R$ 119,90 Internet');
});

test('direção desconhecida bloqueia sugestão até confirmação humana',()=>{
  const value=extraction({direction:'unknown',directionConfidence:0.2,needsConfirmation:true});
  assert.equal(aiDirectionNeedsConfirmation(value),true);
  assert.equal(sourceTextFromAiExtraction(value),null);
  assert.equal(sourceTextFromAiExtraction(value,{direction:'expense'}),'paguei R$ 119,90 Internet');
});

test('transferência gera linguagem explícita de transferência',()=>{
  const value=extraction({direction:'transfer',directionConfidence:0.95});
  assert.equal(sourceTextFromAiExtraction(value),'transferi R$ 119,90 Internet');
});

test('múltiplos valores permanecem opções distintas',()=>{
  const value=extraction({amountMinor:null,amountConfidence:0.3,amountCandidatesMinor:[1000,2000,1000],needsConfirmation:true});
  assert.deepEqual(aiAmountChoices(value),[1000,2000]);
});

test('confiança insuficiente mantém revisão obrigatória',()=>{
  assert.equal(aiExtractionNeedsReview(extraction({overallConfidence:0.7})),true);
  assert.equal(aiExtractionNeedsReview(extraction()),false);
});
