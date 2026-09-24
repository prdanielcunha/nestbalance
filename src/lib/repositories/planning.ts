'use client';

import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';
import type { IntelligencePreferences } from '@/src/core/intelligence-preferences';
import type { MonthlyCloseCheck, ScenarioResult } from '@/src/core/financial-intelligence';
import type { FinancialScope } from '@/src/core/privacy';

async function api<T>(path:string,body:unknown):Promise<T>{
  const token=await getBrowserAuthToken();
  const response=await fetch(path,{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'PLANNING_REQUEST_FAILED');
  return json as T;
}

export type SavedPlanningScenario={
  id:string;
  name:string;
  kind:'purchase'|'income_drop'|'extra_income'|'debt_payment';
  amountMinor:number;
  scope:FinancialScope;
  createdBy:string;
  result:ScenarioResult;
};

export async function loadPlanningScenarios(householdId:string){
  return api<{ok:true;scenarios:SavedPlanningScenario[]}>('/api/planning/scenarios/list',{householdId});
}

export async function savePlanningScenario(input:{
  householdId:string;
  name:string;
  kind:SavedPlanningScenario['kind'];
  amountMinor:number;
  scope:FinancialScope;
  availableMinor:number;
  committedMinor:number;
}){
  return api<{ok:true;scenario:SavedPlanningScenario}>('/api/planning/scenarios/save',input);
}

export async function deletePlanningScenario(householdId:string,scenarioId:string){
  return api<{ok:true}>('/api/planning/scenarios/delete',{householdId,scenarioId});
}

export async function loadMonthlyClose(householdId:string,periodKey:string){
  return api<{ok:true;close:null|{periodKey:string;status:string;completedBy:string;checklist:MonthlyCloseCheck[];summary:Record<string,unknown>|null}}>('/api/planning/month-close/get',{householdId,periodKey});
}

export async function completeMonthlyClose(input:{
  householdId:string;
  periodKey:string;
  checklist:MonthlyCloseCheck[];
  summary:{availableMinor:number;committedMinor:number;projectedRemainderMinor:number;transactionCount:number};
}){
  return api<{ok:true;close:{periodKey:string;status:string}}>('/api/planning/month-close/complete',input);
}

export async function saveIntelligencePreferences(householdId:string,preferences:IntelligencePreferences){
  return api<{ok:true;preferences:IntelligencePreferences}>('/api/member/intelligence-preferences',{householdId,preferences});
}
