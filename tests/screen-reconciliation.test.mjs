import test from 'node:test';
import assert from 'node:assert/strict';
import {screenSourceCandidates,assertScreenRevision,screenChangeKind,validObservationDate} from '../.core-dist/core/screen-reconciliation.js';
import {groupSavingsPots} from '../.core-dist/core/savings-pots.js';
import {parseSavingsPotsFromOcr} from '../.core-dist/core/savings-pot-import.js';
const pot={id:'pot001',name:'Viagem',institutionName:'Nubank',balanceMinor:10000,goalMinor:20000,currency:'BRL',scope:'household',status:'active',source:'screen_import',updatedAtMs:123,observedOn:'2026-09-21'};
test('same names remain separate until an explicit goal association',()=>{
  const b={...pot,id:'pot002',institutionName:'Inter'};
  assert.equal(groupSavingsPots([pot,b]).length,2);
  const grouped=groupSavingsPots([pot,{...b,goalGroupId:pot.id}]);
  assert.equal(grouped.length,1);assert.equal(grouped[0].balanceMinor,20000);assert.equal(grouped[0].goalMinor,20000);
});
test('same bank names require distinguishing accounts; private owners and currencies never merge',()=>{
  const sources=[pot,{...pot,id:'pot002',sourceAccountLabel:'Ayessa'},{...pot,id:'pot003',institutionName:'Inter'}];
  const input={name:'Viagem',institution:'Nubank',currency:'BRL',scope:'household'};
  assert.equal(screenSourceCandidates(sources,input).length,2);
  assert.equal(screenSourceCandidates(sources,{...input,sourceAccountLabel:'Ayessa'})[0].id,'pot002');
  assert.equal(groupSavingsPots([{...pot,scope:'personal',ownerUid:'a',goalGroupId:'g'},{...pot,id:'pot002',scope:'personal',ownerUid:'b',goalGroupId:'g'}]).length,2);
  assert.equal(groupSavingsPots([pot,{...pot,id:'pot002',currency:'USD',goalGroupId:pot.id}]).length,2);
});
test('older and stale revisions cannot overwrite newer data',()=>{
  const d={expectedUpdatedAtMs:123,expectedBalanceMinor:10000};
  assert.doesNotThrow(()=>assertScreenRevision(pot,d,'2026-09-21'));
  assert.throws(()=>assertScreenRevision(pot,d,'2026-09-20'),/OLDER/);
  assert.throws(()=>assertScreenRevision(pot,{...d,expectedUpdatedAtMs:122},'2026-09-21'),/CONFLICT/);
  assert.equal(validObservationDate('2026-02-31'),false);
  assert.equal(screenChangeKind(pot,10000,20000),'unchanged');
  assert.equal(screenChangeKind(pot,10000,30000),'update');
});
test('OCR retains equal-name rows instead of deleting legitimate pots',()=>{
  const s=parseSavingsPotsFromOcr('Cofrinhos\nNubank\nViagem R$ 100,00\nViagem R$ 200,00');
  assert.equal(s.pots.length,2);assert.equal(s.pots.reduce((a,p)=>a+p.balanceMinor,0),30000);
});


test('goal name follows the explicitly chosen objective, not the longest source label',()=>{
 const g=groupSavingsPots([pot,{...pot,id:'other',name:'A very long label at the other bank',goalGroupId:pot.id}]);
 assert.equal(g[0].name,'Viagem');
});
