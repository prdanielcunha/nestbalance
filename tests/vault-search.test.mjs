import test from 'node:test';
import assert from 'node:assert/strict';
import { searchVaultDocuments } from '../.core-dist/core/vault-search.js';

const docs=[
  {
    evidenceId:'energia-set',
    originalName:'IMG_9921.PNG',
    createdAtMs:new Date('2026-09-10T12:00:00Z').getTime(),
    description:'Conta de energia elétrica',
    payee:'Copel',
    amountMinor:18640,
    dateIso:'2026-09-09',
    summary:'Pagamento da energia residencial',
    signals:[{kind:'money',raw:'R$ 186,40',normalized:'BRL:18640',context:'valor pago R$ 186,40'}]
  },
  {
    evidenceId:'iptu-mar',
    originalName:'comprovante.pdf',
    createdAtMs:new Date('2026-03-15T12:00:00Z').getTime(),
    description:'IPTU apartamento',
    payee:'Prefeitura',
    amountMinor:84000,
    dateIso:'2026-03-15',
    rawText:'Pagamento IPTU imóvel parcela única.'
  },
  {
    evidenceId:'mercado-set',
    originalName:'recibo-supermercado.jpg',
    createdAtMs:new Date('2026-09-18T12:00:00Z').getTime(),
    description:'Supermercado',
    merchant:'Mercado Central',
    amountMinor:35080,
    dateIso:'2026-09-18'
  }
];

test('acha comprovante por linguagem lembrada e sinônimo',()=>{
  const hits=searchVaultDocuments('comprovante da luz de setembro',docs);
  assert.equal(hits[0].evidenceId,'energia-set');
  assert.match(hits[0].reason,/energia/i);
});

test('acha evidência por valor',()=>{
  const hits=searchVaultDocuments('R$ 840,00',docs);
  assert.equal(hits[0].evidenceId,'iptu-mar');
});

test('combina descrição e mês para reduzir falso positivo',()=>{
  const hits=searchVaultDocuments('mercado setembro',docs);
  assert.equal(hits[0].evidenceId,'mercado-set');
  assert.ok(hits[0].score>0);
});

test('não retorna resultado quando quase nada da pergunta bate',()=>{
  const hits=searchVaultDocuments('seguro viagem dezembro',docs);
  assert.equal(hits.length,0);
});
