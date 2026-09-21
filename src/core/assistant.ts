import { projectHouseholdFuture, type ProjectionCommitment, type ProjectionInstallmentPlan } from './future-projection.js';

export type AssistantAccount={
  id:string;
  name:string;
  balanceMinor:number;
  status?:string;
};

export type AssistantCommitment=ProjectionCommitment&{
  id:string;
  description:string;
};

export type AssistantInvoice={
  id:string;
  cardId:string;
  invoiceKey:string;
  dueOn:string;
  status?:string;
  confirmedAmountMinor:number;
  paidAmountMinor?:number;
  paymentStatus?:string;
};

export type AssistantInstallmentPlan=ProjectionInstallmentPlan&{
  id:string;
  description?:string;
};

export type AssistantSource={
  kind:'account'|'commitment'|'invoice'|'installment_plan'|'projection';
  id:string;
  label:string;
  amountMinor:number;
  detail:string;
};

export type AssistantAnswer={
  intent:'remaining_to_pay'|'available_now'|'future_months'|'unsupported';
  title:string;
  summary:string;
  answerMinor:number|null;
  sources:AssistantSource[];
  cards:Array<{label:string;amountMinor:number;detail:string}>;
  suggestions:string[];
};

function normalize(value:string){
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}

function positive(value:unknown){
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>0?n:0;
}

export function classifyAssistantIntent(question:string):AssistantAnswer['intent']{
  const q=normalize(question);
  if(!q) return 'unsupported';

  if(
    /quanto .*falta.*pagar/.test(q)||
    /falta.*pagar/.test(q)||
    /ainda.*pagar/.test(q)||
    /contas?.*pendentes?/.test(q)||
    /quanto.*pendente/.test(q)||
    /ainda.*vai.*sair/.test(q)
  ) return 'remaining_to_pay';

  if(
    /quanto.*tenho/.test(q)||
    /saldo.*disponivel/.test(q)||
    /quanto.*disponivel/.test(q)||
    /dinheiro.*disponivel/.test(q)
  ) return 'available_now';

  if(
    /proximos? meses?/.test(q)||
    /meses? seguintes?/.test(q)||
    /parcelas? futuras?/.test(q)||
    /quanto.*mes.*que vem/.test(q)
  ) return 'future_months';

  return 'unsupported';
}

export function answerAssistantQuestion(input:{
  question:string;
  accounts:AssistantAccount[];
  commitments:AssistantCommitment[];
  invoices:AssistantInvoice[];
  installmentPlans:AssistantInstallmentPlan[];
  now:Date;
}):AssistantAnswer{
  const intent=classifyAssistantIntent(input.question);

  if(intent==='remaining_to_pay'){
    const commitmentSources=input.commitments
      .filter(item=>item.status!=='paid'&&item.status!=='cancelled'&&positive(item.amountMinor)>0)
      .map(item=>({
        kind:'commitment' as const,
        id:item.id,
        label:item.description,
        amountMinor:positive(item.amountMinor),
        detail:'Compromisso pendente'
      }));

    const invoiceSources=input.invoices
      .filter(item=>item.paymentStatus!=='paid'&&item.status!=='cancelled')
      .map(item=>{
        const open=Math.max(0,positive(item.confirmedAmountMinor)-positive(item.paidAmountMinor));
        return {
          kind:'invoice' as const,
          id:item.id,
          label:\`Fatura \${item.invoiceKey}\`,
          amountMinor:open,
          detail:item.status==='partial'
            ? 'Valor confirmado até agora; a fatura ainda está em revisão'
            : 'Fatura confirmada e ainda não paga'
        };
      })
      .filter(item=>item.amountMinor>0);

    const sources=[...commitmentSources,...invoiceSources];
    const total=sources.reduce((sum,item)=>sum+item.amountMinor,0);
    const partialInvoices=invoiceSources.filter(source=>
      input.invoices.find(invoice=>invoice.id===source.id)?.status==='partial'
    ).length;

    return {
      intent,
      title:total>0?'Ainda há valores conhecidos para pagar.':'Nada pendente conhecido agora.',
      summary:total>0
        ? \`O NestBalance encontrou \${sources.length} obrigação\${sources.length===1?'':'ões'} aberta\${sources.length===1?'':'s'} no Lar.\${partialInvoices?\` \${partialInvoices} fatura\${partialInvoices===1?' está':'s estão'} em revisão, então o total pode aumentar.\`:''}\`
        : 'Não há compromissos nem faturas abertas confirmadas nos dados atuais.',
      answerMinor:total,
      sources:sources.sort((a,b)=>b.amountMinor-a.amountMinor).slice(0,30),
      cards:[
        {
          label:'Compromissos',
          amountMinor:commitmentSources.reduce((sum,item)=>sum+item.amountMinor,0),
          detail:\`\${commitmentSources.length} item\${commitmentSources.length===1?'':'s'} pendente\${commitmentSources.length===1?'':'s'}\`
        },
        {
          label:'Faturas abertas',
          amountMinor:invoiceSources.reduce((sum,item)=>sum+item.amountMinor,0),
          detail:\`\${invoiceSources.length} fatura\${invoiceSources.length===1?'':'s'} com valor conhecido\`
        }
      ],
      suggestions:['Quanto tenho disponível?','O que já está comprometido nos próximos meses?']
    };
  }

  if(intent==='available_now'){
    const sources=input.accounts
      .filter(account=>account.status!=='inactive')
      .map(account=>({
        kind:'account' as const,
        id:account.id,
        label:account.name,
        amountMinor:Number(account.balanceMinor)||0,
        detail:'Saldo atual informado nesta conta'
      }));
    const total=sources.reduce((sum,item)=>sum+item.amountMinor,0);

    return {
      intent,
      title:'Saldo disponível conhecido',
      summary:sources.length
        ? \`Somando \${sources.length} conta\${sources.length===1?'':'s'} ativa\${sources.length===1?'':'s'} do Lar.\`
        : 'Ainda não há uma conta com saldo disponível para somar.',
      answerMinor:total,
      sources,
      cards:sources.slice(0,6).map(item=>({label:item.label,amountMinor:item.amountMinor,detail:item.detail})),
      suggestions:['Quanto ainda falta pagar?','O que já está comprometido nos próximos meses?']
    };
  }

  if(intent==='future_months'){
    const projection=projectHouseholdFuture(input.commitments,input.installmentPlans,input.now,3);
    const total=projection.reduce((sum,item)=>sum+item.totalMinor,0);
    const monthFmt=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'});
    return {
      intent,
      title:'Compromissos conhecidos dos próximos meses',
      summary:'A projeção usa apenas contas recorrentes confirmadas e planos de parcelas já reconciliados.',
      answerMinor:total,
      sources:input.installmentPlans
        .filter(plan=>plan.status!=='completed'&&plan.status!=='cancelled')
        .slice(0,20)
        .map(plan=>({
          kind:'installment_plan' as const,
          id:plan.id,
          label:plan.description||'Compra parcelada',
          amountMinor:positive(plan.amountMinor),
          detail:\`Parcela \${plan.lastObservedInstallment} de \${plan.totalInstallments} observada\`
        })),
      cards:projection.map(month=>({
        label:monthFmt.format(new Date(month.year,month.monthIndex,1)),
        amountMinor:month.totalMinor,
        detail:\`\${month.itemCount} compromisso\${month.itemCount===1?'':'s'} conhecido\${month.itemCount===1?'':'s'}\`
      })),
      suggestions:['Quanto ainda falta pagar?','Quanto tenho disponível?']
    };
  }

  return {
    intent:'unsupported',
    title:'Posso responder com os dados do seu Lar.',
    summary:'Nesta primeira camada, pergunte sobre saldo disponível, quanto ainda falta pagar ou os próximos meses.',
    answerMinor:null,
    sources:[],
    cards:[],
    suggestions:['Quanto ainda falta pagar?','Quanto tenho disponível?','O que já está comprometido nos próximos meses?']
  };
}
