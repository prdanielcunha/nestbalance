'use client';

import Link from 'next/link';
import { useI18n } from '@/src/i18n/locale-provider';

export function HouseholdCollaborationCard(){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  return <section className="household-panel household-collaboration-card">
    <div>
      <span className="section-kicker">{l('CASAL E FAMÍLIA','COUPLE & FAMILY','PAREJA Y FAMILIA')}</span>
      <h2>{l('Central do Lar','Household Center','Central del Hogar')}</h2>
      <p>{l(
        'Pendências compartilhadas, decisões, comentários, divisão de despesas e um ritual semanal de cinco minutos — sem expor seus itens Pessoais.',
        'Shared tasks, decisions, comments, expense splitting, and a five-minute weekly check-in — without exposing Personal items.',
        'Pendientes compartidas, decisiones, comentarios, división de gastos y un ritual semanal de cinco minutos — sin exponer tus elementos Personales.'
      )}</p>
    </div>
    <div className="household-card-actions">
      <Link className="primary-button" href="/together">{l('Abrir Central do Lar','Open Household Center','Abrir Central del Hogar')}</Link>
      <Link className="ghost-button" href="/support">{l('Suporte e diagnóstico','Support & diagnostics','Soporte y diagnóstico')}</Link>
    </div>
  </section>;
}
