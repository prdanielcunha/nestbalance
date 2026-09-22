import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizeSpending,
  resolvedSpendingCategory,
  deriveFinancialAnomalies,
  deriveRecurringCandidates,
  deriveSpendingComparison
} from '../.core-dist/core/insights.js';

const now=new Date(2026,8,21);
const rows=[
  {id:'aug-market',description:'Supermercado',amountMinor:30000,direction:'expense',observedOn:'2026-08-10'},
  {id:'aug-energy',description:'Energia',amountMinor:10000,direction:'expense',observedOn:'2026-08-12'},
  {id:'jul-energy',description:'Energia',amountMinor:9500,direction:'expense',observedOn:'2026-07-12'},
  {id:'jun-energy',description:'Energia',amountMinor:10500,direction:'expense',observedOn:'2026-06-12'},
  {id:'sep-market',description:'Supermercado',amountMinor:52000,direction:'expense',observedOn:'2026-09-10'},
  {id:'sep-energy',description:'Energia',amountMinor:18000,direction:'expense',observedOn:'2026-09-12'},
  {id:'sep-dup-1',description:'Padaria Central',amountMinor:4200,direction:'expense',observedOn:'2026-09-18'},
  {id:'sep-dup-2',description:'Padaria Central',amountMinor:4200,direction:'expense',observedOn:'2026-09-18'},
  {id:'ignore-payment',description:'Pagamento fatura',amountMinor:100000,direction:'expense',source:'credit_card_invoice_payment',observedOn:'2026-09-15'},
  {id:'ignore-transfer',description:'Transferência',amountMinor:90000,direction:'transfer',observedOn:'2026-09-15'}
];

test('categoriza descrições com regras locais e previsíveis',()=>{
  assert.equal(categorizeSpending('Conta de energia Copel'),'utilities');
  assert.equal(categorizeSpending('Mercado do bairro'),'food');
  assert.equal(categorizeSpending('Uber viagem'),'transport');
  assert.equal(categorizeSpending('Algo sem regra'),'other');
});

test('categoria explícita do usuário vence a heurística automática',()=>{
  assert.equal(resolvedSpendingCategory({description:'Supermercado',category:'health'}),'health');
  assert.equal(resolvedSpendingCategory({description:'Supermercado'}),'food');
});

test('compara gastos do mês sem contar transferência nem pagamento de fatura',()=>{
  const result=deriveSpendingComparison([
    ...rows,
    {id:'sep-manual-category',description:'Compra genérica',category:'education',amountMinor:10000,direction:'expense',observedOn:'2026-09-20'}
  ],now);
  assert.equal(result.currentMinor,88400);
  assert.equal(result.previousMinor,40000);
  assert.equal(result.deltaMinor,48400);
  assert.equal(result.hasComparableData,true);
  assert.equal(result.topIncreases[0].category,'food');
  assert.equal(result.topIncreases[0].deltaMinor,30400);
  assert.equal(result.topIncreases.some(item=>item.category==='education'&&item.deltaMinor===10000),true);
});

test('detecta valor fora do histórico e possível duplicidade sem acusar erro',()=>{
  const anomalies=deriveFinancialAnomalies(rows,now);
  assert.equal(anomalies.some(item=>item.type==='possible_duplicate'&&item.description==='Padaria Central'),true);
  const spike=anomalies.find(item=>item.type==='amount_spike'&&item.description==='Energia');
  assert.ok(spike);
  assert.equal(spike.baselineMinor,10000);
  assert.equal(spike.differenceMinor,8000);
});

test('sugere recorrência apenas após padrão mensal estável',()=>{
  const candidates=deriveRecurringCandidates([
    {id:'1',description:'Netflix',amountMinor:3990,direction:'expense',observedOn:'2026-06-05'},
    {id:'2',description:'Netflix',amountMinor:3990,direction:'expense',observedOn:'2026-07-05'},
    {id:'3',description:'Netflix',amountMinor:3990,direction:'expense',observedOn:'2026-08-05'},
    {id:'4',description:'Compra aleatória',amountMinor:1000,direction:'expense',observedOn:'2026-08-11'}
  ]);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].description,'Netflix');
  assert.equal(candidates[0].observedMonths,3);
  assert.equal(candidates[0].referenceTransactionId,'3');
  assert.equal(candidates[0].suggestedDueDay,5);
});
