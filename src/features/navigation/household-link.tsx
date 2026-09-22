'use client';
import Link from 'next/link';
import { useI18n } from '@/src/i18n/locale-provider';

export function HouseholdLink(){
  const {locale}=useI18n();
  const label=locale==='en'?'Household':locale==='es'?'Hogar':'Lar';
  const aria=locale==='en'?'Household and access':locale==='es'?'Hogar y accesos':'Lar e acessos';
  return <Link href="/household" className="household-pill" aria-label={aria}>{label}</Link>;
}
