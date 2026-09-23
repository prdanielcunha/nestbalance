'use client';
import type { User } from 'firebase/auth';
import type { HouseholdRole } from '@/src/core/household';
import type { AppLocale } from '@/src/core/locale';
import type { HouseholdSessionOption } from '@/src/lib/repositories/session';

export function isE2ePreview(){
  if(process.env.NEXT_PUBLIC_NESTBALANCE_E2E_MODE!=='1'||typeof window==='undefined') return false;
  if(!['127.0.0.1','localhost'].includes(window.location.hostname)) return false;
  return new URLSearchParams(window.location.search).get('e2e')==='1';
}

export function e2eRole():HouseholdRole{
  if(typeof window==='undefined') return 'owner';
  const role=new URLSearchParams(window.location.search).get('e2eRole');
  return role==='read_only'?'read_only':'owner';
}

export function e2eSession(){
  const role=e2eRole();
  const locale:AppLocale='pt-BR';
  const household:HouseholdSessionOption={
    id:'e2e-household',
    name:'Casa de teste',
    role,
    locale,
    currency:'BRL'
  };
  const user={
    uid:'e2e-owner',
    displayName:'Pessoa Teste',
    email:'teste@nestbalance.invalid',
    photoURL:null
  } as unknown as User;
  return {user,householdId:household.id,households:[household],locale,currency:'BRL'};
}

export function e2eFixtureName(){
  if(typeof window==='undefined') return 'full';
  return new URLSearchParams(window.location.search).get('e2eFixture')==='empty'?'empty':'full';
}
