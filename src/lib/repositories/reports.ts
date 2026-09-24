'use client';
import { getBrowserAuthToken } from '@/src/lib/browser-auth-token';

export async function downloadAccountingCsv(householdId:string,periodKey:string){
  const token=await getBrowserAuthToken();
  const response=await fetch('/api/reports/accounting/export',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId,periodKey}),
    cache:'no-store'
  });
  if(!response.ok){
    const json=await response.json().catch(()=>({}));
    throw new Error(json.error||'ACCOUNTING_EXPORT_FAILED');
  }
  return response.blob();
}

export async function createSharedMonthlyReport(householdId:string,periodKey:string){
  const token=await getBrowserAuthToken();
  const response=await fetch('/api/reports/monthly/share',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({householdId,periodKey}),
    cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SHARED_REPORT_CREATE_FAILED');
  return json as {
    ok:true;
    token:string;
    expiresAtMs:number;
    summary:{
      periodKey:string;
      incomeMinor:number;
      expenseMinor:number;
      transactionCount:number;
      openCommitmentsMinor:number;
      openCommitmentsCount:number;
    };
  };
}

export async function viewSharedMonthlyReport(token:string){
  const response=await fetch('/api/reports/monthly/view',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({token}),
    cache:'no-store',
    credentials:'omit'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(json.error||'SHARED_REPORT_LOAD_FAILED');
  return json as {ok:true;report:{product:'NestBalance';kind:string;periodKey:string;summary:Record<string,number|string>;expiresAtMs:number}};
}
