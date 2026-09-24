'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { COMMERCIAL_ENFORCEMENT, NESTBALANCE_PLANS } from '@/src/core/plans';

export default function PlansPage(){
  const [lang,setLang]=useState<'pt'|'en'|'es'>('pt');
  useEffect(()=>{
    const value=navigator.language.toLowerCase();
    setLang(value.startsWith('en')?'en':value.startsWith('es')?'es':'pt');
  },[]);
  const l=(pt:string,en:string,es:string)=>lang==='en'?en:lang==='es'?es:pt;
  const planCopy={
    free:{
      title:'Free',
      desc:l('Organização essencial para começar sem perder acesso aos seus dados.','Essential organization to get started without losing access to your data.','Organización esencial para empezar sin perder acceso a tus datos.')
    },
    family:{
      title:l('Família','Family','Familia'),
      desc:l('Coordenação do Lar e inteligência completa para quem organiza dinheiro em conjunto.','Household coordination and full intelligence for people who manage money together.','Coordinación del Hogar e inteligencia completa para quienes organizan dinero juntos.')
    },
    premium:{
      title:'Premium',
      desc:l('Mais automação, cenários e suporte para quem quer economizar tempo.','More automation, scenarios, and support for people who want to save time.','Más automatización, escenarios y soporte para quienes quieren ahorrar tiempo.')
    }
  } as const;

  return <main className="public-info-shell">
    <header className="public-info-header"><Link href="/">NestBalance</Link><nav><Link href="/trust">{l('Segurança e IA','Security & AI','Seguridad e IA')}</Link><Link href="/">{l('Abrir app','Open app','Abrir app')}</Link></nav></header>
    <section className="public-info-hero">
      <span>{l('PLANOS','PLANS','PLANES')}</span>
      <h1>{l('Pagar por tempo poupado, não para resgatar os próprios dados.','Pay for time saved, not to recover your own data.','Pagar por tiempo ahorrado, no para recuperar tus propios datos.')}</h1>
      <p>{l(
        'O catálogo comercial já está definido, mas a cobrança permanece desligada durante o beta. Preços serão publicados antes de qualquer ativação.',
        'The commercial catalog is defined, but billing stays off during beta. Prices will be published before any activation.',
        'El catálogo comercial ya está definido, pero el cobro permanece desactivado durante el beta. Los precios se publicarán antes de cualquier activación.'
      )}</p>
    </section>

    <section className="public-plan-grid">
      {NESTBALANCE_PLANS.map(plan=>{
        const copy=planCopy[plan.id];
        return <article key={plan.id}>
          <span>{plan.id==='free'?l('COMEÇAR','START','EMPEZAR'):plan.id==='family'?l('CASAL E FAMÍLIA','COUPLE & FAMILY','PAREJA Y FAMILIA'):l('MAIS TEMPO','MORE TIME','MÁS TIEMPO')}</span>
          <h2>{copy.title}</h2>
          <p>{copy.desc}</p>
          <ul>
            <li>{l('Acesso aos próprios dados: sempre','Own-data access: always','Acceso a tus propios datos: siempre')}</li>
            <li>{l('Exportação dos próprios dados: sempre','Own-data export: always','Exportación de tus propios datos: siempre')}</li>
            <li>{plan.householdMembers===null?l('Pessoas no Lar: sem limite definido','Household members: no defined cap','Personas en el Hogar: sin límite definido'):l(`Até ${plan.householdMembers} pessoas no catálogo proposto`,`Up to ${plan.householdMembers} people in the proposed catalog`,`Hasta ${plan.householdMembers} personas en el catálogo propuesto`)}</li>
            <li>{plan.intelligentInsights==='full'?l('Inteligência explicável completa','Full explainable intelligence','Inteligencia explicable completa'):l('Insights essenciais','Essential insights','Insights esenciales')}</li>
            <li>{plan.savedScenarios===null?l('Cenários salvos sem limite definido','No defined cap on saved scenarios','Sin límite definido de escenarios guardados'):l(`${plan.savedScenarios} cenários salvos no catálogo proposto`,`${plan.savedScenarios} saved scenarios in the proposed catalog`,`${plan.savedScenarios} escenarios guardados en el catálogo propuesto`)}</li>
          </ul>
        </article>;
      })}
    </section>

    <section className="public-info-card commercial-principles">
      <span>{l('PRINCÍPIOS','PRINCIPLES','PRINCIPIOS')}</span>
      <h2>{l('O que nunca deve virar paywall','What should never become a paywall','Lo que nunca debe convertirse en paywall')}</h2>
      <p>{l(
        'Ver, corrigir, exportar ou excluir seus próprios dados não depende de um plano pago. Recursos pagos devem justificar valor por automação, inteligência, colaboração e economia de tempo.',
        'Viewing, correcting, exporting, or deleting your own data does not depend on a paid plan. Paid features must justify value through automation, intelligence, collaboration, and time savings.',
        'Ver, corregir, exportar o eliminar tus propios datos no depende de un plan pago. Las funciones pagas deben justificar su valor mediante automatización, inteligencia, colaboración y ahorro de tiempo.'
      )}</p>
      <small>{COMMERCIAL_ENFORCEMENT==='disabled_beta'?l('Cobrança: desativada no beta.','Billing: disabled in beta.','Cobro: desactivado en beta.'):''}</small>
    </section>
  </main>;
}
