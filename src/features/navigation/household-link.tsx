'use client';
import Link from 'next/link';
import { useI18n } from '@/src/i18n/locale-provider';

export function HouseholdLink({detailed=false}:{detailed?:boolean}){
  const {locale}=useI18n();
  const shortLabel=locale==='en'?'Access':locale==='es'?'Accesos':'Acessos';
  const detailedLabel=locale==='en'?'Household & access':locale==='es'?'Hogar y accesos':'Lar e acessos';
  const aria=locale==='en'?'Sharing and access':locale==='es'?'Compartir y accesos':'Compartilhar e acessos';
  return <Link href="/household" className="household-pill" aria-label={aria}>
    {detailed
      ? <><span className="household-label-short">{shortLabel}</span><span className="household-label-long">{detailedLabel}</span></>
      : shortLabel}
  </Link>;
}
