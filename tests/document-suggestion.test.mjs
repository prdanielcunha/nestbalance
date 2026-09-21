import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestCaptureFromDocument, sourceTextForChosenDocumentAmount } from '../.core-dist/core/document-suggestion.js';

function signals(candidates) {
  return {deterministic:true,inputCharacters:100,scannedCharacters:100,limited:false,candidateLimitReached:false,candidates};
}

test('um único valor explícito vira sugestão revisável',()=>{
  const result=suggestCaptureFromDocument('comprovante-internet.pdf',signals([
    {kind:'money',raw:'R$ 119,90',normalized:'BRL:11990',amountMinor:11990,start:1,end:10,context:'Total R$ 119,90',evidence:'explicit_label'}
  ]));
  assert.equal(result.state,'suggested');
  if(result.state==='suggested'){
    assert.equal(result.amountMinor,11990);
    assert.equal(result.sourceText,'comprovante internet R$ 119,90');
    assert.equal(result.needsReview,true);
  }
});

test('vários valores nunca escolhem silenciosamente',()=>{
  const result=suggestCaptureFromDocument('fatura.pdf',signals([
    {kind:'money',raw:'R$ 10,00',normalized:'BRL:1000',amountMinor:1000,start:1,end:8,context:'',evidence:'explicit_label'},
    {kind:'money',raw:'R$ 20,00',normalized:'BRL:2000',amountMinor:2000,start:20,end:27,context:'',evidence:'explicit_label'}
  ]));
  assert.deepEqual(result,{state:'choose_amount',amountsMinor:[1000,2000]});
});

test('sem valor claro não inventa lançamento',()=>{
  assert.deepEqual(suggestCaptureFromDocument('documento.pdf',signals([])),{state:'no_amount'});
});

test('parcela única é preservada como candidato na sugestão',()=>{
  const s=signals([
    {kind:'money',raw:'R$ 300,00',normalized:'BRL:30000',amountMinor:30000,start:1,end:10,context:'',evidence:'explicit_label'},
    {kind:'installment',raw:'5/12',normalized:'5/12',installmentCurrent:5,installmentTotal:12,start:12,end:16,context:'',evidence:'pattern_only'}
  ]);
  const result=suggestCaptureFromDocument('magalu.pdf',s);
  assert.equal(result.state,'suggested');
  if(result.state==='suggested') assert.equal(result.sourceText,'magalu R$ 300,00 5/12');
  assert.equal(sourceTextForChosenDocumentAmount('magalu.pdf',30000,s),'magalu R$ 300,00 5/12');
});
