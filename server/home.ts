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
    connectedProductType:typeof data.connectedProductType==='string'?data.connectedProductType:null,
    source:typeof data.source==='string'?data.source:null,
    institutionName:typeof data.institutionName==='string'?data.institutionName:null,
    connectionId:typeof data.connectionId==='string'?data.connectionId:null,
    automaticallyInvestedMinor:Number.isSafeInteger(data.automaticallyInvestedMinor)?data.automaticallyInvestedMinor:null,
    balanceMinor:Number(data.balanceMinor??data.amountMinor??0),
    currency:String(data.currency||'BRL'),
    status:String(data.status||'active')
  };
}

function cardDto(doc:any){
  const data=doc.data();
  return {
    id:doc.id,
    name:String(data.name||'Cartão'),
    brand:String(data.brand||'other'),
    closingDay:Number.isInteger(data.closingDay)?data.closingDay:1,
    dueDay:Number.isInteger(data.dueDay)?data.dueDay:1,
    last4:typeof data.last4==='string'&&/^\d{4}$/.test(data.last4)?data.last4:null,
    limitMinor:Number.isSafeInteger(data.limitMinor)?data.limitMinor:null,
    currency:String(data.currency||'BRL'),
    status:String(data.status||'active')
  };
}

function installmentPlanDto(doc:any){
  const data=doc.data();
  return {
    id:doc.id,
    description:String(data.description||'Compra parcelada'),
    amountMinor:Number(data.amountMinor||0),
    currency:String(data.currency||'BRL'),
    status:String(data.status||'active'),
    totalInstallments:Number(data.totalInstallments||0),
    lastObservedInstallment:Number(data.lastObservedInstallment||0),
    anchorDueOn:String(data.anchorDueOn||''),
    lastObservedInvoiceKey:String(data.lastObservedInvoiceKey||'')
  };
}

function invoiceImportDto(doc:any){
  const data=doc.data();
  return {
    id:doc.id,
    cardId:String(data.cardId||''),
    invoiceKey:String(data.invoiceKey||''),
    dueOn:String(data.dueOn||''),
    status:String(data.status||'partial'),
    confirmedAmountMinor:Number.isSafeInteger(data.confirmedAmountMinor)?data.confirmedAmountMinor:0,
    paymentStatus:String(data.paymentStatus||'unpaid'),
    paidAmountMinor:Number.isSafeInteger(data.paidAmountMinor)?data.paidAmountMinor:0,
    paidOn:typeof data.paidOn==='string'?data.paidOn:null,
    paidFromAccountId:typeof data.paidFromAccountId==='string'?data.paidFromAccountId:null
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
    source:typeof data.source==='string'?data.source:null,
    status:data.status||'confirmed',
    observedOn:data.observedOn||null,
    recurring:Boolean(data.recurring),
    recurrence:data.recurrence||null,
    dueDay:Number.isInteger(data.dueDay)?data.dueDay:null,
    installment:data.installment&&Number.isInteger(data.installment.current)&&Number.isInteger(data.installment.total)
      ? {current:data.installment.current,total:data.installment.total}
      : null,
    installmentPlanId:typeof data.installmentPlanId==='string'?data.installmentPlanId:null,
    cardId:typeof data.cardId==='string'?data.cardId:null,
    invoiceKey:typeof data.invoiceKey==='string'?data.invoiceKey:null,
    invoiceImportId:typeof data.invoiceImportId==='string'?data.invoiceImportId:null
  };
}

export async function getHomeData(req:Request,res:Response){
  res.setHeader('Cache-Control','private, no-store');
  try{
    const user=await requireFirebaseUser(req);
    const householdId=String(req.body?.householdId||'');
    await requireHouseholdMember(householdId,user.uid);

    const household=adminDb.collection('households').doc(householdId);
    const currentMonthKey=new Date().toISOString().slice(0,7);
    const [accounts,cards,transactions,commitments,installmentPlans,invoiceImports,commitmentPayments]=await Promise.all([
      household.collection('accounts').where('status','==','active').limit(50).get(),
      household.collection('creditCards').where('status','==','active').limit(25).get(),
      household.collection('transactions').orderBy('createdAt','desc').limit(100).get(),
      household.collection('commitments').orderBy('createdAt','desc').limit(100).get(),
      household.collection('installmentPlans').where('status','==','active').limit(100).get(),
      household.collection('invoiceImports').orderBy('updatedAt','desc').limit(100).get(),
      household.collection('commitmentPayments').where('periodKey','==',currentMonthKey).limit(200).get()
    ]);

    const paidThisMonth=new Set(
      commitmentPayments.docs.map(doc=>String(doc.data().commitmentId||'')).filter(Boolean)
    );

    return res.json({
      ok:true,
      accounts:accounts.docs.map(accountDto),
      cards:cards.docs.map(cardDto),
      transactions:transactions.docs.map(movementDto).sort((a,b)=>
        String(b.observedOn||'').localeCompare(String(a.observedOn||''))
      ),
      commitments:commitments.docs.map(doc=>({
        ...movementDto(doc),
        paidThisMonth:paidThisMonth.has(doc.id)
      })),
      installmentPlans:installmentPlans.docs.map(installmentPlanDto),
      invoiceImports:invoiceImports.docs.map(invoiceImportDto),
      refreshedAt:new Date().toISOString()
    });
  }catch(err:any){
    const safe=['AUTH_REQUIRED','INVALID_SESSION','HOUSEHOLD_ACCESS_DENIED'];
    return error(res,err.statusCode||500,safe.includes(err.message)?err.message:'HOME_LOAD_FAILED');
  }
}
