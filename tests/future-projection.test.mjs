import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFutureCommitments, projectFutureInstallmentPlans, projectHouseholdFuture } from '../.core-dist/core/future-projection.js';

test('projeta contas mensais sem persistir duplicatas',()=>{
  const result=projectFutureCommitments([
    {amountMinor:11990,status:'pending',recurring:true,recurrence:'monthly'}
  ],new Date(2026,8,20),3);
  assert.deepEqual(result.map(x=>x.totalMinor),[11990,11990,11990]);
  assert.deepEqual(result.map(x=>x.key),['2026-10','2026-11','2026-12']);
});

test('parcela atual 5 de 12 projeta somente parcelas futuras restantes',()=>{
  const result=projectFutureCommitments([
    {amountMinor:30000,status:'pending',recurring:true,recurrence:'monthly',installment:{current:5,total:12}}
  ],new Date(2026,8,20),8);
  assert.deepEqual(result.map(x=>x.totalMinor),[30000,30000,30000,30000,30000,30000,30000,0]);
});

test('parcela tem precedência sobre recorrência para não continuar após o total',()=>{
  const result=projectFutureCommitments([
    {amountMinor:128600,status:'pending',recurring:true,recurrence:'monthly',installment:{current:11,total:12}}
  ],new Date(2026,8,20),3);
  assert.deepEqual(result.map(x=>x.totalMinor),[128600,0,0]);
});

test('conta apenas com vencimento mas sem recorrência explícita não invade meses futuros',()=>{
  const result=projectFutureCommitments([
    {amountMinor:285000,status:'pending',recurring:false,recurrence:null}
  ],new Date(2026,8,20),3);
  assert.deepEqual(result.map(x=>x.totalMinor),[0,0,0]);
});

test('itens pagos e cancelados não são projetados',()=>{
  const result=projectFutureCommitments([
    {amountMinor:10000,status:'paid',recurring:true,recurrence:'monthly'},
    {amountMinor:20000,status:'cancelled',recurring:true,recurrence:'monthly'}
  ],new Date(2026,8,20),2);
  assert.deepEqual(result.map(x=>x.totalMinor),[0,0]);
});


test('plano reconciliado projeta apenas parcelas posteriores à última observada',()=>{
  const result=projectFutureInstallmentPlans([
    {
      id:'plan-1',
      amountMinor:8990,
      status:'active',
      totalInstallments:10,
      lastObservedInstallment:3,
      anchorDueOn:'2026-09-14'
    }
  ],new Date(2026,8,21),4);

  assert.deepEqual(result.map(x=>x.key),['2026-10','2026-11','2026-12','2027-01']);
  assert.deepEqual(result.map(x=>x.totalMinor),[8990,8990,8990,8990]);
});

test('plano usa vencimento real e pula meses já passados sem recriar dívida',()=>{
  const result=projectFutureInstallmentPlans([
    {
      id:'plan-1',
      amountMinor:8990,
      status:'active',
      totalInstallments:10,
      lastObservedInstallment:3,
      anchorDueOn:'2026-09-14'
    }
  ],new Date(2026,10,20),3);

  assert.deepEqual(result.map(x=>x.key),['2026-12','2027-01','2027-02']);
  assert.deepEqual(result.map(x=>x.totalMinor),[8990,8990,8990]);
});

test('plano concluído não aparece em próximos meses',()=>{
  const result=projectFutureInstallmentPlans([
    {
      id:'plan-done',
      amountMinor:4500,
      status:'completed',
      totalInstallments:4,
      lastObservedInstallment:4,
      anchorDueOn:'2026-09-10'
    }
  ],new Date(2026,8,21),3);
  assert.deepEqual(result.map(x=>x.totalMinor),[0,0,0]);
});

test('plano reconciliado substitui compromisso ligado e evita dupla contagem',()=>{
  const result=projectHouseholdFuture([
    {
      amountMinor:8990,
      status:'pending',
      recurring:false,
      installment:{current:3,total:10},
      installmentPlanId:'plan-1'
    },
    {
      amountMinor:11990,
      status:'pending',
      recurring:true,
      recurrence:'monthly'
    }
  ],[
    {
      id:'plan-1',
      amountMinor:8990,
      status:'active',
      totalInstallments:10,
      lastObservedInstallment:3,
      anchorDueOn:'2026-09-14'
    }
  ],new Date(2026,8,21),2);

  assert.deepEqual(result.map(x=>x.totalMinor),[20980,20980]);
  assert.deepEqual(result.map(x=>x.installmentsMinor),[8990,8990]);
  assert.deepEqual(result.map(x=>x.fixedMinor),[11990,11990]);
});
