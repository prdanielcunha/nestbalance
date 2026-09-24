import test from 'node:test';
import assert from 'node:assert/strict';
import { NESTBALANCE_PLANS, canAccessOwnData, canExportOwnData, COMMERCIAL_ENFORCEMENT } from '../.core-dist/core/plans.js';
import { IMPORTER_REGISTRY } from '../.core-dist/core/importer-registry.js';

test('commercial plans never block access or export of own data',()=>{
  assert.equal(COMMERCIAL_ENFORCEMENT,'disabled_beta');
  for(const plan of NESTBALANCE_PLANS){
    assert.equal(plan.ownDataAccess,true);
    assert.equal(plan.ownDataExport,true);
    assert.equal(canAccessOwnData(plan.id),true);
    assert.equal(canExportOwnData(plan.id),true);
  }
});

test('heavy importers declare duplicate detection before expensive processing',()=>{
  const heavy=IMPORTER_REGISTRY.filter(item=>item.input==='pdf'||item.input==='image');
  assert.ok(heavy.length>=4);
  assert.equal(heavy.every(item=>item.duplicateDetection==='before_expensive_processing'),true);
  assert.equal(IMPORTER_REGISTRY.every(item=>item.localFirst),true);
});
