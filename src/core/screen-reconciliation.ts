import {normalizeSavingsPotName} from './savings-pots.js';
import type {BalanceCoverage} from './balance-composition.js';

export type ScreenSource={id:string;name:string;sourceName?:string|null;institutionName?:string|null;currency:string;scope?:'household'|'personal';ownerUid?:string|null;sourceAccountLabel?:string|null;last4?:string|null;balanceMinor:number|null;updatedAtMs?:number|null;balanceAsOfMs?:number|null;observedOn?:string|null;goalGroupId?:string|null;goalMinor?:number|null;targetDate?:string|null;balanceCoverage?:BalanceCoverage;includedSavingsMinor?:number|null};
export type ScreenDecision={targetId?:string|null;expectedUpdatedAtMs?:number|null;expectedBalanceMinor?:number|null;createNew?:boolean;sourceAccountLabel?:string;goalGroupId?:string|null;balanceCoverage?:BalanceCoverage;includedSavingsMinor?:number|null};
export type ScreenReview={observedOn:string;accounts:ScreenDecision[];pots:ScreenDecision[]};

export function screenSourceCandidates(sources:ScreenSource[],input:{name:string;institution:string|null;currency:string;scope:string;ownerUid?:string|null;sourceAccountLabel?:string;last4?:string|null}){
  return sources.filter(s=>s.currency===input.currency&&(s.scope||'household')===input.scope&&(input.scope!=='personal'||s.ownerUid===input.ownerUid)
    &&normalizeSavingsPotName(s.institutionName||'')===normalizeSavingsPotName(input.institution||'')
    &&(normalizeSavingsPotName(s.name)===normalizeSavingsPotName(input.name)||!!s.sourceName&&normalizeSavingsPotName(s.sourceName)===normalizeSavingsPotName(input.name))
    &&(!input.sourceAccountLabel||normalizeSavingsPotName(s.sourceAccountLabel||'')===normalizeSavingsPotName(input.sourceAccountLabel))
    &&(!input.last4||!s.last4||s.last4===input.last4));
}

export function screenChangeKind(existing:ScreenSource|undefined,balanceMinor:number,goalMinor?:number|null,targetDate?:string|null){
  if(!existing) return 'create' as const;
  return existing.balanceMinor===balanceMinor&&(goalMinor==null||existing.goalMinor===goalMinor)&&(!targetDate||existing.targetDate===targetDate)?'unchanged' as const:'update' as const;
}

export function validObservationDate(value:string){
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}

export function assertScreenRevision(current:ScreenSource,decision:ScreenDecision,observedOn:string){
  if(decision.expectedUpdatedAtMs!==current.updatedAtMs||decision.expectedBalanceMinor!==current.balanceMinor) throw new Error('SCREEN_REVIEW_CONFLICT');
  // An undated earlier observation must never silently replace a later one.
  if(current.observedOn&&observedOn<current.observedOn) throw new Error('SCREEN_OBSERVATION_OLDER');
}
