import { readFileSync } from 'node:fs';
import { parseFinancialText } from '../.core-dist/core/text-parser.js';
import { redactFinancialText } from '../.core-dist/core/financial-redaction.js';

const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/ai-benchmark-cases.json',import.meta.url),'utf8'));
if(fixture.dataPolicy!=='synthetic-or-anonymized-only') throw new Error('AI_BENCHMARK_DATA_POLICY_REQUIRED');

let fieldChecks=0;
let fieldPasses=0;
const parserFailures=[];
for(const item of fixture.parserCases){
  const actual=parseFinancialText(item.input);
  for(const [key,expected] of Object.entries(item.expected)){
    fieldChecks++;
    let value;
    if(key==='amountMinor') value=actual.money?.amountMinor;
    else if(key==='requiresReview') value=actual.needsReview?.includes(expected);
    else value=actual[key];
    const ok=key==='requiresReview'?value===true:value===expected;
    if(ok) fieldPasses++;
    else parserFailures.push({id:item.id,field:key,expected,actual:value??null});
  }
}

let privacyChecks=0;
let privacyPasses=0;
const privacyFailures=[];
for(const item of fixture.redactionCases){
  const result=redactFinancialText(item.input);
  for(const value of item.mustNotContain||[]){
    privacyChecks++;
    if(!result.text.includes(value)) privacyPasses++;
    else privacyFailures.push({id:item.id,rule:'must_not_contain'});
  }
  for(const value of item.mustContain||[]){
    privacyChecks++;
    if(result.text.includes(value)) privacyPasses++;
    else privacyFailures.push({id:item.id,rule:'must_contain'});
  }
}

const parserScore=fieldChecks?fieldPasses/fieldChecks:0;
const privacyScore=privacyChecks?privacyPasses/privacyChecks:0;
const report={
  schemaVersion:1,
  datasetPolicy:fixture.dataPolicy,
  cases:{parser:fixture.parserCases.length,redaction:fixture.redactionCases.length},
  parserScore:Number(parserScore.toFixed(4)),
  privacyScore:Number(privacyScore.toFixed(4)),
  parserFailures,
  privacyFailures
};
console.log('[ai-benchmark] '+JSON.stringify(report));
if(parserScore<0.95||privacyScore!==1){
  console.error('[ai-benchmark] Local AI-safety benchmark did not meet the release threshold.');
  process.exit(1);
}
