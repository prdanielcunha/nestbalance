import { readFileSync } from 'node:fs';

const path=process.argv.find(arg=>arg.endsWith('.json'))||'docs/ops/slo-evidence-template.json';
const requireGates=process.argv.includes('--require-gates');
const data=JSON.parse(readFileSync(path,'utf8'));
if(data.source!=='production-aggregate-only'||!data.metrics||typeof data.metrics!=='object') throw new Error('SLO_EVIDENCE_SCHEMA_INVALID');
const forbidden=/(?:description|prompt|ocr|filename|document|balance|amount|email|phone|uid|householdId|userId)/i;
for(const key of Object.keys(data.metrics)) if(forbidden.test(key)) throw new Error('SLO_EVIDENCE_FORBIDDEN_FIELD:'+key);

const m=data.metrics;
const finite=(value)=>Number.isFinite(Number(value));
const gates={
  releaseShaRecorded:typeof data.releaseSha==='string'&&/^[0-9a-f]{40}$/i.test(data.releaseSha),
  measurementWindowRecorded:typeof data.window==='string'&&data.window.trim().length>=3,
  lcpP75Under2500:finite(m.lcpP75Ms)&&Number(m.lcpP75Ms)<2500,
  inpP75Under200:finite(m.inpP75Ms)&&Number(m.inpP75Ms)<200,
  clsP75Under01:finite(m.clsP75)&&Number(m.clsP75)<0.1,
  apiErrorRateUnder005:finite(m.apiErrorRate)&&Number(m.apiErrorRate)<0.005,
  bundleRegressionAtMost10Pct:finite(m.bundleRegressionMaxPct)&&Number(m.bundleRegressionMaxPct)<=10,
  syncP95Under2s:finite(m.syncP95Ms)&&Number(m.syncP95Ms)<2000,
  apiAvailabilityAtLeast999:finite(m.apiAvailability)&&Number(m.apiAvailability)>=0.999,
  crashFreeAtLeast998:finite(m.crashFreeRate)&&Number(m.crashFreeRate)>=0.998
};
const complete=Object.values(gates).every(Boolean);
console.log(JSON.stringify({schemaVersion:1,status:complete?'slo_evidence_complete':'slo_evidence_incomplete',releaseSha:data.releaseSha||null,window:data.window||null,gates},null,2));
if(requireGates&&!complete) process.exit(2);
