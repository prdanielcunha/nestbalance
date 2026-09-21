export type StoredCardPurchase={
  cardId:string;
  amountMinor:number;
  invoiceDueOn:string;
  installment?:{current:number;total:number}|null;
  status?:string;
};

export type CardInvoiceProjection={
  cardId:string;
  dueOn:string;
  totalMinor:number;
  itemCount:number;
  installmentCount:number;
};

function validDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d]=value.split('-').map(Number);
  const date=new Date(y,m-1,d);
  return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
}

function addMonths(value:string,offset:number){
  const [y,m,d]=value.split('-').map(Number);
  const target=new Date(y,m-1+offset,1);
  const max=new Date(target.getFullYear(),target.getMonth()+1,0).getDate();
  return [
    target.getFullYear(),
    String(target.getMonth()+1).padStart(2,'0'),
    String(Math.min(d,max)).padStart(2,'0')
  ].join('-');
}

function validInstallment(value:StoredCardPurchase['installment']){
  return Boolean(
    value&&
    Number.isInteger(value.current)&&
    Number.isInteger(value.total)&&
    value.current>=1&&
    value.total>=value.current&&
    value.total<=120
  );
}

export function projectStoredCardPurchases(purchases:StoredCardPurchase[]):CardInvoiceProjection[]{
  const grouped=new Map<string,CardInvoiceProjection>();

  for(const purchase of purchases){
    if(
      !purchase.cardId||
      !Number.isSafeInteger(purchase.amountMinor)||
      purchase.amountMinor===0||
      !validDate(purchase.invoiceDueOn)||
      purchase.status==='cancelled'||
      purchase.status==='settled'
    ) continue;

    const remaining=validInstallment(purchase.installment)
      ? purchase.installment!.total-purchase.installment!.current+1
      : 1;

    for(let offset=0;offset<remaining;offset++){
      const dueOn=addMonths(purchase.invoiceDueOn,offset);
      const key=purchase.cardId+'|'+dueOn;
      const current=grouped.get(key)||{
        cardId:purchase.cardId,
        dueOn,
        totalMinor:0,
        itemCount:0,
        installmentCount:0
      };
      current.totalMinor+=purchase.amountMinor;
      current.itemCount+=1;
      if(validInstallment(purchase.installment)) current.installmentCount+=1;
      grouped.set(key,current);
    }
  }

  return [...grouped.values()].sort((a,b)=>a.dueOn.localeCompare(b.dueOn)||a.cardId.localeCompare(b.cardId));
}

export function cardCommitmentsForWindow(
  purchases:StoredCardPurchase[],
  fromIso:string,
  toIso:string
){
  if(!validDate(fromIso)||!validDate(toIso)||fromIso>toIso) throw new Error('INVALID_WINDOW');
  return projectStoredCardPurchases(purchases)
    .filter(item=>item.dueOn>=fromIso&&item.dueOn<=toIso)
    .reduce((sum,item)=>sum+item.totalMinor,0);
}
