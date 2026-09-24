import type { Request, Response } from 'express';
import { runtimeIdentity } from './http-runtime.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';
import { openFinanceGateStatus } from './commercial-gates.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

export async function getSupportDiagnostics(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid,'read');
    const requestId=String(res.getHeader('X-Request-ID')||'');
    const openFinance=openFinanceGateStatus();
    return res.json({
      ok:true,
      diagnosticId:requestId||null,
      ...runtimeIdentity(),
      status:'operational',
      capabilities:{
        authentication:true,
        financialApi:true,
        realtimeInvalidation:true,
        localOcr:true,
        accountingExport:true,
        sharedReports:true,
        openFinance:openFinance.commerciallyReady&&openFinance.executableRoutesEnabled
      },
      openFinanceGate:{
        ready:openFinance.commerciallyReady,
        exposed:false
      }
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'SUPPORT_DIAGNOSTICS_FAILED');
  }
}
