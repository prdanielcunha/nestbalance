export type NestBalancePlanId='free'|'family'|'premium';

export type NestBalancePlan={
  id:NestBalancePlanId;
  name:string;
  description:string;
  householdMembers:number|null;
  intelligentInsights:'essential'|'full';
  savedScenarios:number|null;
  accountingExports:boolean;
  prioritySupport:boolean;
  ownDataAccess:true;
  ownDataExport:true;
};

export const NESTBALANCE_PLANS:readonly NestBalancePlan[]=[
  {
    id:'free',
    name:'Free',
    description:'Organização financeira essencial sem bloquear seus próprios dados.',
    householdMembers:2,
    intelligentInsights:'essential',
    savedScenarios:3,
    accountingExports:true,
    prioritySupport:false,
    ownDataAccess:true,
    ownDataExport:true
  },
  {
    id:'family',
    name:'Família',
    description:'Coordenação do Lar, inteligência completa e mais pessoas no mesmo espaço.',
    householdMembers:6,
    intelligentInsights:'full',
    savedScenarios:null,
    accountingExports:true,
    prioritySupport:false,
    ownDataAccess:true,
    ownDataExport:true
  },
  {
    id:'premium',
    name:'Premium',
    description:'Automação, inteligência completa e suporte prioritário para quem quer economizar mais tempo.',
    householdMembers:null,
    intelligentInsights:'full',
    savedScenarios:null,
    accountingExports:true,
    prioritySupport:true,
    ownDataAccess:true,
    ownDataExport:true
  }
] as const;

export const COMMERCIAL_ENFORCEMENT='disabled_beta' as const;

export function planById(id:unknown){
  return NESTBALANCE_PLANS.find(plan=>plan.id===id)??NESTBALANCE_PLANS[0];
}

export function canAccessOwnData(_plan:NestBalancePlanId){
  return true;
}

export function canExportOwnData(_plan:NestBalancePlanId){
  return true;
}
