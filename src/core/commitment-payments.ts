export type PayableCommitment={
  id:string;
  description:string;
  amountMinor:number;
  status?:string;
  recurring?:boolean;
  recurrence?:string|null;
  dueDay?:number|null;
  installment?:{current:number;total:number}|null;
};

export type PaymentMatchInput={
  amountMinor:number;
  description?:string|null;
  observedOn?:string|null;
};

export type CommitmentMatch={
  commitment:PayableCommitment;
  score:number;
  reasons:string[];
};

export function periodKeyForDate(value:string|Date){
  const date=typeof value==='string'?new Date(value+'T12:00:00'):value;
  if(Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function words(value:string){
  return [...new Set(
    value.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g,' ')
      .split(/\s+/)
      .filter(word=>word.length>=3&&!['paguei','pagamento','conta','pix','recebi','transferi'].includes(word))
  )];
}

function dayFromIso(value?:string|null){
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(year,month-1,day);
  return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?day:null;
}

export function matchPayableCommitments(
  input:PaymentMatchInput,
  commitments:PayableCommitment[]
):CommitmentMatch[]{
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0) return [];
  const inputWords=words(input.description||'');
  const observedDay=dayFromIso(input.observedOn);

  return commitments
    .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&Number.isSafeInteger(item.amountMinor)&&item.amountMinor>0)
    .map(commitment=>{
      let score=0;
      const reasons:string[]=[];
      const delta=Math.abs(commitment.amountMinor-input.amountMinor);
      if(delta===0){
        score+=70;
        reasons.push('same_amount');
      }else{
        const ratio=delta/Math.max(commitment.amountMinor,input.amountMinor);
        if(ratio<=0.01){
          score+=52;
          reasons.push('close_amount');
        }else if(ratio<=0.03){
          score+=32;
          reasons.push('near_amount');
        }
      }

      const commitmentWords=words(commitment.description);
      const overlap=inputWords.filter(word=>commitmentWords.includes(word));
      if(overlap.length){
        const nameScore=Math.min(25,10+overlap.length*7);
        score+=nameScore;
        reasons.push('similar_name');
      }

      if(observedDay!==null&&Number.isInteger(commitment.dueDay)){
        const distance=Math.abs(observedDay-Number(commitment.dueDay));
        if(distance===0){
          score+=12;
          reasons.push('same_due_day');
        }else if(distance<=3){
          score+=7;
          reasons.push('near_due_day');
        }
      }

      return {commitment,score,reasons};
    })
    .filter(match=>match.score>=52)
    .sort((a,b)=>b.score-a.score||a.commitment.description.localeCompare(b.commitment.description))
    .slice(0,5);
}

export function commitmentPaymentPeriod(commitment:PayableCommitment&{installment?:{current:number;total:number}|null},paidOn:string){
  const installment=commitment.installment;
  if(
    commitment.recurring===true&&commitment.recurrence==='monthly' ||
    Boolean(installment&&Number.isInteger(installment.current)&&Number.isInteger(installment.total)&&installment.total>=installment.current)
  ){
    return periodKeyForDate(paidOn);
  }
  return 'once';
}
