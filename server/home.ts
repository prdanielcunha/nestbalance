import type { Request, Response } from 'express';
import { adminDb } from './firebase-admin.js';
import { requireFirebaseUser, requireHouseholdMember } from './auth.js';

function error(res:Response,status:number,code:string){
  return res.status(status).json({ok:false,error:code});
}

function accountDto(doc:any){
  const data=doc.data();
  return {
    id:doc.id,
    name:String(data.name||'Conta'),
    type:String(data.type||'bank'),
    balanceMinor:Number(data.balanceMinor??data.amountMinor??0),
    currency:String(data.currency||'BRL'),
    status:String(data.status||'active')
  };
}

function movementDto(doc:any){
  const data=doc.data();
  return {
    id:doc.id,
    description:String(data.description||'Movimento'),
    amountMinor:Number(data.amountMinor||0),
    currency:String(data.currency||'BRL'),
    direction:data.direction||'expense',
    status:data.status||'confirmed',
    observedOn:data.observedOn||null,
    recurring:Boolean(data.recurring),
    recurrence:data.recurrence||null,
    dueDay:Number.isInteger(data.dueDay)?data.dueDay:null,
    installment:data.installment&&Number.isInteger(data.installment.current)&&Number.isInteger(data.installment.total)
      ? {current:data.installment.current,total:data.installment.total}
      : null
  };
}

export async function getHomeData(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);

    const household=adminDb.collection('households').doc(householdId);
    const [accounts,transactions,commitments]=await Promise.all([
      household.collection('accounts').where('status','==','active').limit(50).get(),
      household.collection('transactions').orderBy('createdAt','desc').limit(100).get(),
      household.collection('commitments').orderBy('createdAt','desc').limit(100).get()
    ]);

    return res.json({
      ok:true,
      accounts:accounts.docs.map(accountDto),
      transactions:transactions.docs.map(movementDto),
      commitments:commitments.docs.map(movementDto),
      refreshedAt:new Date().toISOString()
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOME_LOAD_FAILED');
  }
}
