'use client';
import Link from 'next/link';
import { useI18n } from '@/src/i18n/locale-provider';

export function HouseholdLink(){
  const {locale,valuesHidden,toggleValues}=useI18n();
  const label=locale==='en'?'Access':locale==='es'?'Accesos':'Acessos';
  const aria=locale==='en'?'Sharing and access':locale==='es'?'Compartir y accesos':'Compartilhar e acessos';
  const privacyLabel=valuesHidden
    ? (locale==='en'?'Show values':locale==='es'?'Mostrar valores':'Mostrar valores')
    : (locale==='en'?'Hide values':locale==='es'?'Ocultar valores':'Ocultar valores');
  return <div className="household-actions">
    <button className="money-privacy-toggle" type="button" onClick={toggleValues} aria-label={privacyLabel} title={privacyLabel}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {valuesHidden
          ? <><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 4.2A10.7 10.7 0 0112 4c5.3 0 9 5 9 5a15.8 15.8 0 01-2.1 2.5M6.2 6.2C4.2 7.5 3 9 3 9s3.7 5 9 5c1 0 2-.2 2.9-.5"/></>
          : <><path d="M3 9s3.7-5 9-5 9 5 9 5-3.7 5-9 5S3 9 3 9z"/><circle cx="12" cy="9" r="2.5"/></>}
      </svg>
    </button>
    <Link href="/household" className="household-pill" aria-label={aria}>{label}</Link>
  </div>;
}
