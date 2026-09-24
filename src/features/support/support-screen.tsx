'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { HouseholdRole } from '@/src/core/household';
import { IMPORTER_REGISTRY } from '@/src/core/importer-registry';
import { createSharedMonthlyReport, downloadAccountingCsv } from '@/src/lib/repositories/reports';
import { enrollFamilyBeta, loadBetaStatus, loadSupportDiagnostics, type SupportDiagnostics } from '@/src/lib/repositories/support';
import { AppShell } from '@/src/features/navigation/app-shell';
import { useI18n } from '@/src/i18n/locale-provider';

function download(blob:Blob,name:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function SupportScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {locale,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [diagnostics,setDiagnostics]=useState<SupportDiagnostics|null>(null);
  const [beta,setBeta]=useState<{enrolled:boolean;enrolledAt:string|null}|null>(null);
  const [working,setWorking]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [shareUrl,setShareUrl]=useState('');
  const periodKey=useMemo(()=>{
    const now=new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  },[]);

  async function refresh(){
    setError('');
    try{
      const [diag,betaStatus]=await Promise.all([
        loadSupportDiagnostics(householdId),
        loadBetaStatus(householdId)
      ]);
      setDiagnostics(diag);
      setBeta({enrolled:betaStatus.enrolled,enrolledAt:betaStatus.enrolledAt});
    }catch{
      setError(l('Não conseguimos carregar o diagnóstico agora.','We could not load diagnostics right now.','No pudimos cargar el diagnóstico ahora.'));
    }
  }

  useEffect(()=>{void refresh();},[householdId]);

  async function accountingExport(){
    setWorking('csv');setError('');setNotice('');
    try{
      const blob=await downloadAccountingCsv(householdId,periodKey);
      download(blob,`nestbalance-contabil-${periodKey}.csv`);
      setNotice(l('Exportação contábil preparada no seu aparelho.','Accounting export prepared on your device.','Exportación contable preparada en tu dispositivo.'));
    }catch{
      setError(l('Não conseguimos preparar a exportação.','We could not prepare the export.','No pudimos preparar la exportación.'));
    }finally{setWorking('');}
  }

  async function shareReport(){
    setWorking('share');setError('');setNotice('');
    try{
      const result=await createSharedMonthlyReport(householdId,periodKey);
      const url=`${window.location.origin}/shared-report?token=${encodeURIComponent(result.token)}`;
      setShareUrl(url);
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(url).catch(()=>undefined);
      setNotice(l(
        'Link agregado criado por 7 dias. Ele não mostra movimentos individuais, descrições nem documentos.',
        'An aggregate link was created for 7 days. It does not show individual transactions, descriptions, or documents.',
        'Se creó un enlace agregado por 7 días. No muestra movimientos individuales, descripciones ni documentos.'
      ));
    }catch{
      setError(l('Não conseguimos criar o relatório compartilhável.','We could not create the shareable report.','No pudimos crear el informe compartible.'));
    }finally{setWorking('');}
  }

  async function joinBeta(){
    if(working) return;
    setWorking('beta');setError('');setNotice('');
    try{
      await enrollFamilyBeta(householdId);
      setBeta({enrolled:true,enrolledAt:new Date().toISOString()});
      setNotice(l(
        'Você entrou no beta. Mediremos somente a presença semanal no app, sem conteúdo financeiro, para entender retenção.',
        'You joined the beta. We will measure only weekly app presence, without financial content, to understand retention.',
        'Entraste al beta. Mediremos solo la presencia semanal en la app, sin contenido financiero, para entender la retención.'
      ));
    }catch{
      setError(l('Não conseguimos concluir sua entrada no beta.','We could not complete beta enrollment.','No pudimos completar tu inscripción al beta.'));
    }finally{setWorking('');}
  }

  return <AppShell className="support-shell" subtitle={l('Suporte e diagnóstico','Support & diagnostics','Soporte y diagnóstico')} canContribute={role!=='read_only'} householdLink="none" headerActions={<Link className="text-link" href="/household">{l('Voltar','Back','Volver')}</Link>}>
    <section className="support-hero">
      <span>{l('AJUDA SEM EXPOR SEUS DADOS','HELP WITHOUT EXPOSING YOUR DATA','AYUDA SIN EXPONER TUS DATOS')}</span>
      <h1>{l('Diagnóstico que não lê sua vida financeira.','Diagnostics that do not read your financial life.','Diagnóstico que no lee tu vida financiera.')}</h1>
      <p>{l(
        'Esta área mostra versão, ambiente, capacidades e estado do serviço. Ela não envia saldos, descrições, documentos, OCR ou prompts para o suporte.',
        'This area shows version, environment, capabilities, and service state. It does not send balances, descriptions, documents, OCR, or prompts to support.',
        'Esta área muestra versión, entorno, capacidades y estado del servicio. No envía saldos, descripciones, documentos, OCR ni prompts al soporte.'
      )}</p>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {notice&&<p className="notice-copy" role="status">{notice}</p>}

    <div className="support-grid">
      <section className="support-card diagnostics-card">
        <div className="section-title"><div><h2>{l('Estado do serviço','Service status','Estado del servicio')}</h2><span>{l('dados técnicos seguros','safe technical data','datos técnicos seguros')}</span></div></div>
        {diagnostics?<div className="diagnostics-list">
          <div><span>{l('Estado','Status','Estado')}</span><strong>{l('Operacional','Operational','Operativo')}</strong></div>
          <div><span>{l('Ambiente','Environment','Entorno')}</span><strong>{diagnostics.environment}</strong></div>
          <div><span>{l('Release','Release','Release')}</span><strong>{diagnostics.release||l('não informado','not reported','no informado')}</strong></div>
          <div><span>{l('Código de diagnóstico','Diagnostic code','Código de diagnóstico')}</span><strong>{diagnostics.diagnosticId||'—'}</strong></div>
          <div><span>Open Finance</span><strong>{diagnostics.openFinanceGate.exposed?l('Disponível','Available','Disponible'):l('Não exposto neste release','Not exposed in this release','No expuesto en este release')}</strong></div>
        </div>:<div className="support-skeleton"/>}
        <p className="support-footnote">{l(
          'Se precisar relatar um problema, o código acima ajuda a localizar a requisição técnica sem copiar o conteúdo financeiro.',
          'If you need to report a problem, the code above helps locate the technical request without copying financial content.',
          'Si necesitas informar un problema, el código de arriba ayuda a localizar la solicitud técnica sin copiar contenido financiero.'
        )}</p>
      </section>

      <section className="support-card">
        <div className="section-title"><div><h2>{l('Relatórios e exportação','Reports & export','Informes y exportación')}</h2><span>{periodKey}</span></div></div>
        <p>{l('Seus próprios dados continuam exportáveis independentemente do plano.','Your own data remains exportable regardless of plan.','Tus propios datos siguen siendo exportables independientemente del plan.')}</p>
        <div className="support-actions">
          <button className="primary-button" disabled={Boolean(working)} onClick={()=>void accountingExport()}>{working==='csv'?l('Preparando…','Preparing…','Preparando…'):l('Baixar CSV contábil','Download accounting CSV','Descargar CSV contable')}</button>
          <button className="ghost-button" disabled={Boolean(working)} onClick={()=>void shareReport()}>{working==='share'?l('Criando…','Creating…','Creando…'):l('Criar resumo compartilhável','Create shareable summary','Crear resumen compartible')}</button>
        </div>
        {shareUrl&&<div className="share-url-box"><span>{l('Link válido por 7 dias','Link valid for 7 days','Enlace válido por 7 días')}</span><input readOnly value={shareUrl}/><button type="button" onClick={()=>navigator.clipboard?.writeText(shareUrl)}>{l('Copiar','Copy','Copiar')}</button></div>}
      </section>
    </div>

    <section className="support-card">
      <div className="section-title"><div><h2>{l('O que o NestBalance já consegue importar','What NestBalance can already import','Lo que NestBalance ya puede importar')}</h2><span>{l('local primeiro','local first','local primero')}</span></div></div>
      <div className="importer-grid">{IMPORTER_REGISTRY.map(item=><article key={item.id}><span>{item.input.toUpperCase()}</span><strong>{item.id.replaceAll('_',' ')}</strong><p>{item.description}</p><small>{item.aiFallback?l('IA só como fallback','AI only as fallback','IA solo como fallback'):l('Sem IA externa','No external AI','Sin IA externa')}</small></article>)}</div>
    </section>

    <div className="support-grid">
      <section className="support-card beta-card">
        <div className="section-title"><div><h2>{l('Programa beta com famílias reais','Real-family beta program','Programa beta con familias reales')}</h2><span>{l('opt-in','opt-in','opt-in')}</span></div></div>
        {beta?.enrolled?<>
          <strong className="beta-status">{l('Você participa do beta','You are in the beta','Participas en el beta')}</strong>
          <p>{l('Para medir retenção, registramos somente em quais semanas você voltou ao app. Nenhum conteúdo financeiro entra nessa medição.','To measure retention, we record only which weeks you returned to the app. No financial content is included in that measurement.','Para medir retención, registramos solo en qué semanas volviste a la app. Ningún contenido financiero entra en esa medición.')}</p>
          {beta.enrolledAt&&<small>{l('Entrada','Joined','Ingreso')}: {formatDate(beta.enrolledAt,{dateStyle:'medium'})}</small>}
        </>:<>
          <p>{l('Ao participar, você autoriza a medição de presença semanal para avaliarmos retenção e qualidade do produto. Isso não inclui valores, descrições, documentos ou perguntas ao Assistente.','By joining, you authorize weekly presence measurement so we can evaluate retention and product quality. This excludes amounts, descriptions, documents, and Assistant questions.','Al participar, autorizas la medición de presencia semanal para evaluar retención y calidad. Esto no incluye valores, descripciones, documentos ni preguntas al Asistente.')}</p>
          <button className="primary-button" disabled={working==='beta'} onClick={()=>void joinBeta()}>{working==='beta'?l('Entrando…','Joining…','Ingresando…'):l('Participar do beta','Join the beta','Participar del beta')}</button>
        </>}
      </section>

      <section className="support-card links-card">
        <div className="section-title"><div><h2>{l('Transparência','Transparency','Transparencia')}</h2><span>{l('como funciona','how it works','cómo funciona')}</span></div></div>
        <Link href="/trust">{l('Segurança, privacidade e IA','Security, privacy & AI','Seguridad, privacidad e IA')}</Link>
        <Link href="/plans">{l('Planos e princípios de cobrança','Plans and billing principles','Planes y principios de cobro')}</Link>
        <Link href="/privacy">{l('Privacidade e seus dados','Privacy & your data','Privacidad y tus datos')}</Link>
      </section>
    </div>
  </AppShell>;
}
