'use client';
import type {
  HomeAccount,
  HomeCardSnapshot,
  HomeCreditCard,
  HomeInstallmentPlan,
  HomeInvoiceImport,
  HomeRow,
  HomeSavingsPot
} from '@/src/lib/repositories/home';
import type { ProactivityPreferences } from '@/src/core/proactivity';

function dayKey(date:Date){
  return date.toISOString().slice(0,10);
}

export function e2eHomeFixture(empty=false){
  const now=new Date();
  const month=dayKey(now).slice(0,7);
  const yesterday=new Date(now.getTime()-24*60*60*1000);
  const oldBalance=new Date(now.getTime()-8*24*60*60*1000).getTime();

  if(empty){
    return {
      ok:true as const,
      accounts:[] as HomeAccount[],
      cards:[] as HomeCreditCard[],
      transactions:[] as HomeRow[],
      commitments:[] as HomeRow[],
      installmentPlans:[] as HomeInstallmentPlan[],
      invoiceImports:[] as HomeInvoiceImport[],
      savingsPots:[] as HomeSavingsPot[],
      cardSnapshots:[] as HomeCardSnapshot[],
      proactivityPreferences:{dueBills:true,anomalies:true,spendingChanges:true,installmentEnds:false} as ProactivityPreferences,
      dismissedAttentionKeys:[] as string[],
      dismissedRecurrenceKeys:[] as string[],
      refreshedAt:now.toISOString()
    };
  }

  const accounts:HomeAccount[]=[
    {id:'account-main',name:'Conta principal',type:'bank',balanceMinor:482000,balanceAsOfMs:now.getTime(),currency:'BRL',status:'active',scope:'household',institutionName:'Nubank'},
    {id:'account-old',name:'Reserva corrente',type:'bank',balanceMinor:90000,balanceAsOfMs:oldBalance,currency:'BRL',status:'active',scope:'household',institutionName:'Banco Inter'}
  ];
  const transactions:HomeRow[]=[
    {id:'tx-income',description:'Salário',amountMinor:850000,currency:'BRL',direction:'income',observedOn:month+'-05',status:'confirmed',scope:'household'},
    {id:'tx-market',description:'Supermercado',amountMinor:42870,currency:'BRL',direction:'expense',observedOn:month+'-12',status:'confirmed',scope:'household',category:'groceries'},
    {id:'tx-water',description:'Água',amountMinor:18600,currency:'BRL',direction:'expense',observedOn:dayKey(yesterday),status:'confirmed',scope:'household',category:'housing'}
  ];
  const commitments:HomeRow[]=[
    {id:'bill-internet',description:'Internet',amountMinor:11990,currency:'BRL',direction:'expense',dueDay:Math.max(1,now.getDate()-1),status:'pending',recurring:true,recurrence:'monthly',paidThisMonth:false,scope:'household'},
    {id:'bill-energy',description:'Energia',amountMinor:24340,currency:'BRL',direction:'expense',dueDay:Math.min(28,now.getDate()+2),status:'pending',recurring:true,recurrence:'monthly',paidThisMonth:false,scope:'household'}
  ];
  const cards:HomeCreditCard[]=[
    {id:'card-main',name:'Nubank Platinum',brand:'mastercard',closingDay:18,dueDay:25,last4:'4242',limitMinor:1200000,currency:'BRL',status:'active',scope:'household'}
  ];
  const installmentPlans:HomeInstallmentPlan[]=[
    {id:'plan-tv',description:'TV',amountMinor:30000,currency:'BRL',status:'active',totalInstallments:12,lastObservedInstallment:11,anchorDueOn:month+'-25',lastObservedInvoiceKey:month,scope:'household'}
  ];
  const invoiceImports:HomeInvoiceImport[]=[
    {id:'invoice-main',cardId:'card-main',invoiceKey:month,dueOn:month+'-25',status:'partial',confirmedAmountMinor:438642,paymentStatus:'unpaid',paidAmountMinor:0,paidOn:null,paidFromAccountId:null,scope:'household'}
  ];
  const savingsPots:HomeSavingsPot[]=[
    {id:'pot-trip',name:'Viagem',balanceMinor:101568,goalMinor:250000,targetDate:null,note:null,currency:'BRL',institutionName:'Nubank',source:'screen_import',trackingMode:'bank_mirror',hasCover:false,coverVersion:null,automation:null,status:'active',scope:'household'},
    {id:'pot-emergency',name:'Reserva de emergência',balanceMinor:200000,goalMinor:600000,targetDate:null,note:null,currency:'BRL',institutionName:'Mercado Pago',source:'manual',trackingMode:'manual',hasCover:false,coverVersion:null,automation:null,status:'active',scope:'household'}
  ];
  const cardSnapshots:HomeCardSnapshot[]=[];

  return {
    ok:true as const,
    accounts,cards,transactions,commitments,installmentPlans,invoiceImports,savingsPots,cardSnapshots,
    proactivityPreferences:{dueBills:true,anomalies:true,spendingChanges:true,installmentEnds:true} as ProactivityPreferences,
    dismissedAttentionKeys:[] as string[],
    dismissedRecurrenceKeys:[] as string[],
    refreshedAt:now.toISOString()
  };
}
