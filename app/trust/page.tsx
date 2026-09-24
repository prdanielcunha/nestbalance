'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TrustPage(){
  const [lang,setLang]=useState<'pt'|'en'|'es'>('pt');
  useEffect(()=>{
    const value=navigator.language.toLowerCase();
    setLang(value.startsWith('en')?'en':value.startsWith('es')?'es':'pt');
  },[]);
  const l=(pt:string,en:string,es:string)=>lang==='en'?en:lang==='es'?es:pt;

  return <main className="public-info-shell">
    <header className="public-info-header"><Link href="/">NestBalance</Link><nav><Link href="/plans">{l('Planos','Plans','Planes')}</Link><Link href="/">{l('Abrir app','Open app','Abrir app')}</Link></nav></header>
    <section className="public-info-hero">
      <span>{l('SEGURANÇA · PRIVACIDADE · IA','SECURITY · PRIVACY · AI','SEGURIDAD · PRIVACIDAD · IA')}</span>
      <h1>{l('A verdade financeira continua sendo sua.','Your financial truth stays yours.','Tu verdad financiera sigue siendo tuya.')}</h1>
      <p>{l(
        'O NestBalance foi desenhado para organizar dados financeiros sem transformar telemetria, IA ou colaboração em uma porta lateral para sua privacidade.',
        'NestBalance is designed to organize financial data without turning telemetry, AI, or collaboration into a side door into your privacy.',
        'NestBalance está diseñado para organizar datos financieros sin convertir la telemetría, la IA o la colaboración en una puerta lateral a tu privacidad.'
      )}</p>
    </section>

    <section className="trust-grid">
      <article><span>01</span><h2>{l('Backend como autoridade','Backend as authority','Backend como autoridad')}</h2><p>{l('O navegador usa Firebase para autenticação; operações financeiras passam pela API autenticada, que aplica papéis e escopos.','The browser uses Firebase for authentication; financial operations go through the authenticated API, which enforces roles and scopes.','El navegador usa Firebase para autenticación; las operaciones financieras pasan por la API autenticada, que aplica roles y alcances.')}</p></article>
      <article><span>02</span><h2>{l('Lar não significa “sem privacidade”','Household does not mean “no privacy”','Hogar no significa “sin privacidad”')}</h2><p>{l('Itens Pessoais ficam visíveis somente para o dono, inclusive dentro de um Lar compartilhado.','Personal items are visible only to their owner, even inside a shared Household.','Los elementos Personales son visibles solo para su dueño, incluso dentro de un Hogar compartido.')}</p></article>
      <article><span>03</span><h2>{l('IA local primeiro','Local-first AI','IA local primero')}</h2><p>{l('Regras determinísticas, parsing e OCR local vêm antes de modelos externos. Uma falha de IA não pode inutilizar o produto.','Deterministic rules, parsing, and local OCR come before external models. An AI failure must not make the product unusable.','Las reglas determinísticas, el parsing y el OCR local vienen antes que los modelos externos. Una falla de IA no debe inutilizar el producto.')}</p></article>
      <article><span>04</span><h2>Gemini</h2><p>{l('O fallback gratuito é limitado a texto minimizado/redigido e exige a política de consentimento aplicável. Imagem financeira bruta não deve ser enviada por essa rota.','The free fallback is limited to minimized/redacted text and requires the applicable consent policy. Raw financial images should not be sent through that lane.','El fallback gratuito se limita a texto minimizado/redactado y requiere la política de consentimiento aplicable. Las imágenes financieras brutas no deben enviarse por esa vía.')}</p></article>
      <article><span>05</span><h2>{l('Telemetria sem conteúdo','Content-free telemetry','Telemetría sin contenido')}</h2><p>{l('Web Vitals, funil, sync e crashes registram sinais técnicos. Não registramos saldos, descrições, documentos, OCR, perguntas ou prompts nesses eventos.','Web Vitals, funnel, sync, and crashes record technical signals. We do not record balances, descriptions, documents, OCR, questions, or prompts in those events.','Web Vitals, embudo, sincronización y crashes registran señales técnicas. No registramos saldos, descripciones, documentos, OCR, preguntas ni prompts en esos eventos.')}</p></article>
      <article><span>06</span><h2>Open Finance</h2><p>{l('A integração bancária existe como código isolado, mas não é exposta neste release. Só pode entrar na superfície depois de contrato, custo variável, consentimento, revogação e reconciliação certificados.','Bank integration exists as isolated code but is not exposed in this release. It may enter the product surface only after contract, variable cost, consent, revocation, and reconciliation are certified.','La integración bancaria existe como código aislado, pero no está expuesta en este release. Solo puede entrar en el producto después de certificar contrato, costo variable, consentimiento, revocación y reconciliación.')}</p></article>
    </section>

    <section className="public-info-card">
      <span>{l('CONTROLE','CONTROL','CONTROL')}</span>
      <h2>{l('Exportar, excluir e revogar','Export, delete, and revoke','Exportar, eliminar y revocar')}</h2>
      <p>{l(
        'Dentro do app, a Central de Privacidade permite exportar dados, apagar itens Pessoais e, para o titular, excluir o Lar. Sessões também podem ser revogadas.',
        'Inside the app, the Privacy Center lets you export data, delete Personal items, and, for the owner, delete the Household. Sessions can also be revoked.',
        'Dentro de la app, la Central de Privacidad permite exportar datos, eliminar elementos Personales y, para el titular, eliminar el Hogar. Las sesiones también pueden revocarse.'
      )}</p>
    </section>
  </main>;
}
