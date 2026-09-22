import { createHash } from 'node:crypto';
import { isSpendingCategory, recurringPatternKey, type SpendingCategory } from '../src/core/insights.js';
import { normalizeFinancialScope, type FinancialScope } from '../src/core/privacy.js';

export type LearnedCategoryRule={
  patternKey:string;
  category:SpendingCategory;
  scope:FinancialScope;
  ownerUid:string|null;
};

export function categoryRuleDocId(scope:FinancialScope,ownerUid:string|null,patternKey:string){
  return createHash('sha256')
    .update(`category|${scope}|${ownerUid||''}|${patternKey}`)
    .digest('hex')
    .slice(0,40);
}

export function categoryFromRecordAndRules(data:any,rules:LearnedCategoryRule[]){
  if(isSpendingCategory(data?.category)) return data.category;
  if(data?.direction!=='expense'||data?.source==='credit_card_invoice_payment') return null;
  const patternKey=recurringPatternKey(String(data?.description||''));
  if(patternKey.length<3) return null;
  const scope=normalizeFinancialScope(data?.scope);
  const ownerUid=scope==='personal'&&typeof data?.ownerUid==='string'?data.ownerUid:null;
  return rules.find(rule=>
    rule.patternKey===patternKey&&
    rule.scope===scope&&
    (scope==='household'||rule.ownerUid===ownerUid)
  )?.category||null;
}

export function learnedCategoryRuleFromDoc(doc:any):LearnedCategoryRule|null{
  const data=doc.data();
  const patternKey=String(data?.patternKey||'');
  if(patternKey.length<3||!isSpendingCategory(data?.category)) return null;
  const scope=normalizeFinancialScope(data?.scope);
  const ownerUid=scope==='personal'&&typeof data?.ownerUid==='string'?data.ownerUid:null;
  if(scope==='personal'&&!ownerUid) return null;
  return {patternKey,category:data.category,scope,ownerUid};
}

export async function learnedCategoryForDescription(
  household:any,
  scope:FinancialScope,
  ownerUid:string|null,
  description:string
){
  const patternKey=recurringPatternKey(description);
  if(patternKey.length<3) return null;
  const snap=await household.collection('categoryRules').doc(categoryRuleDocId(scope,ownerUid,patternKey)).get();
  if(!snap.exists) return null;
  const rule=learnedCategoryRuleFromDoc(snap);
  return rule?.category||null;
}
