'use client';
import Link from 'next/link';
import { ProductTopbar } from '@/src/features/navigation/product-topbar';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { deleteHouseholdPermanently, deleteMyPersonalData, exportPrivacyData, loadPrivacyStatus, recordPrivacyConsent, type PrivacyStatus } from '@/src/lib/repositories/privacy';
import { useI18n } from '@/src/i18n/locale-provider';
import { SecurityPanel } from '@/src/features/privacy/security-panel';

function download(blob:Blob,name:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function PrivacyCenter({householdId,user,householdName,role}:{householdId:string;user:User;householdName:string;role:string}){
  const {locale,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const personalPhrase=locale==='en'?'DELETE PERSONAL':locale==='es'?'ELIMINAR PERSONAL':'EXCLUIR PESSOAL';
  const [status,setStatus]=useState<PrivacyStatus|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [working,setWorking]=useState('');
  const [personalConfirm,setPersonalConfirm]=useState('');
  const [householdConfirm,setHouseholdConfirm]=useState('');

  async function refresh(){
    try{setStatus(await loadPrivacyStatus(householdId));setError('');}
    catch{setError(l('Não conseguimos carregar suas opções de privacidade agora.','We could not load your privacy options right now.','No pudimos cargar tus opciones de privacidad ahora.'));}
  }
  useEffect(()=>{void refresh();},[householdId]);

  async function consent(){
    setWorking('consent');setError('');setNotice('');
    try{
      await recordPrivacyConsent(householdId);
      setNotice(l('Preferência de privacidade registrada.','Privacy preference saved.','Preferencia de privacidad guardada.'));
      await refresh();
    }catch{
      setError(l('Não conseguimos registrar isso agora.','We could not save that right now.','No pudimos guardar eso ahora.'));
    }finally{setWorking('');}
  }

  async function doExport(mode:'accessible'|'personal'){
    setWorking('export-'+mode);setError('');setNotice('');
    try{
      const blob=await exportPrivacyData(householdId,mode);
      download(blob,'nestbalance-'+mode+'-'+new Date().toISOString().slice(0,10)+'.json');
      setNotice(mode==='personal'
        ? l('Exportamos somente seus itens pessoais.','We exported only your private items.','Exportamos solo tus elementos privados.')
        : l('Exportamos tudo que sua conta pode ver neste Lar.','We exported everything your account can see in this household.','Exportamos todo lo que tu cuenta puede ver en este hogar.'));
    }catch{
      setError(l('Não conseguimos preparar sua exportação agora.','We could not prepare your export right now.','No pudimos preparar tu exportación ahora.'));
    }finally{setWorking('');}
  }

  async function deletePersonal(){
    if(personalConfirm!==personalPhrase) return;
    setWorking('personal-delete');setError('');setNotice('');
    try{
      const result=await deleteMyPersonalData(householdId);
      const count=Object.values(result.counts).reduce((a,b)=>a+b,0);
      setNotice(l(
        'Itens pessoais excluídos. '+count+' registros foram removidos.',
        'Private items deleted. '+count+' records were removed.',
        'Elementos privados eliminados. Se eliminaron '+count+' registros.'
      ));
      setPersonalConfirm('');
    }catch{
      setError(l(
        'Não conseguimos excluir seus itens pessoais agora. Nada foi apagado parcialmente pela interface.',
        'We could not delete your private items right now. The interface did not partially delete anything.',
        'No pudimos eliminar tus elementos privados ahora. La interfaz no eliminó nada parcialmente.'
      ));
    }finally{setWorking('');}
  }

  async function deleteLar(){
    if(householdConfirm!==householdName) return;
    setWorking('household-delete');setError('');setNotice('');
    try{
      await deleteHouseholdPermanently(householdId,householdConfirm);
      window.location.assign('/');
    }catch(err:any){
      setError(String(err?.message||'')==='OPEN_FINANCE_REVOCATION_FAILED'
        ? l(
            'Não excluímos o Lar porque uma conexão bancária ainda não pôde ser revogada com segurança.',
            'We did not delete the household because a bank connection could not be safely revoked yet.',
            'No eliminamos el hogar porque una conexión bancaria todavía no pudo revocarse de forma segura.'
          )
        : l(
            'Não conseguimos excluir este Lar. Nenhum atalho de segurança foi usado.',
            'We could not delete this household. No security shortcut was used.',
            'No pudimos eliminar este hogar. No se usó ningún atajo de seguridad.'
          ));
    }finally{setWorking('');}
  }

  return <main className="app-shell privacy-shell">
    <ProductTopbar section={l('Privacidade e seus dados','Privacy & your data','Privacidad y tus datos')} showHousehold={false}>
      <Link href="/household" className="household-back">{l('Voltar','Back','Volver')}</Link>
    </ProductTopbar>

    <section className="area-hero privacy-hero">
      <span>{l('Controle sem vigilância','Control without surveillance','Control sin vigilancia')}</span>
      <h1>{l('Seus dados continuam seus.','Your data stays yours.','Tus datos siguen siendo tuyos.')}</h1>
      <p>{l(
        'Lar é compartilhado. Pessoal é só seu. O servidor aplica essa separação em cada leitura e escrita — não é apenas um filtro visual.',
        'Household data is shared. Private data is yours alone. The server enforces that separation on every read and write — it is not just a visual filter.',
        'Los datos del hogar se comparten. Lo privado es solo tuyo. El servidor aplica esa separación en cada lectura y escritura; no es solo un filtro visual.'
      )}</p>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {notice&&<p className="notice-copy" role="status">{notice}</p>}

    <section className="privacy-grid">
      <article className="privacy-card">
        <span>{l('ESCOPO','SCOPE','ALCANCE')}</span>
        <h2>{l('Lar × Pessoal','Household × Private','Hogar × Privado')}</h2>
        <p>{l(
          'Itens do Lar aparecem para membros autorizados. Itens marcados como “Só para mim” só aparecem na sua própria conta, mesmo para administradores do Lar.',
          'Household items appear to authorized members. Items marked “Only me” appear only in your own account, even to household administrators.',
          'Los elementos del hogar aparecen para miembros autorizados. Los elementos marcados “Solo yo” aparecen únicamente en tu cuenta, incluso para administradores del hogar.'
        )}</p>
        <div className="privacy-split">
          <div><strong>{l('Lar','Household','Hogar')}</strong><small>{l('verdade financeira compartilhada','shared financial truth','verdad financiera compartida')}</small></div>
          <div><strong>{l('Pessoal','Private','Privado')}</strong><small>{l('isolado por usuário','isolated per user','aislado por usuario')}</small></div>
        </div>
      </article>

      <article className="privacy-card">
        <span>{l('FINALIDADE','PURPOSE','FINALIDAD')}</span>
        <h2>{l('Por que usamos estes dados','Why we use this data','Por qué usamos estos datos')}</h2>
        <p>{l(
          'Para organizar sua vida financeira, preservar evidências enviadas e calcular reconciliações e previsões que você pediu. O NestBalance não precisa de CVV nem do número completo do cartão.',
          'To organize your finances, preserve the evidence you send, and calculate the reconciliations and forecasts you request. NestBalance does not need your CVV or full card number.',
          'Para organizar tus finanzas, conservar las evidencias que envías y calcular conciliaciones y previsiones que solicitas. NestBalance no necesita tu CVV ni el número completo de tu tarjeta.'
        )}</p>
        {!status
          ? <small>{l('Carregando preferência…','Loading preference…','Cargando preferencia…')}</small>
          : !status.accepted
            ? <button className="primary-button" disabled={Boolean(working)} onClick={()=>void consent()}>{working==='consent'?l('Registrando…','Saving…','Guardando…'):l('Confirmar que entendi','Confirm I understand','Confirmar que entendí')}</button>
            : <small className="privacy-ok">{l('Preferência registrada','Preference saved','Preferencia guardada')}{status.acceptedAt?' · '+formatDate(status.acceptedAt,{dateStyle:'medium'}):''}.</small>}
      </article>

      <article className="privacy-card">
        <span>{l('RETENÇÃO','RETENTION','RETENCIÓN')}</span>
        <h2>{l('Quanto tempo fica','How long it stays','Cuánto tiempo permanece')}</h2>
        <p>{l(
          'Dados financeiros permanecem enquanto o Lar existir ou até uma exclusão solicitada.',
          'Financial data stays while the household exists or until a deletion is requested.',
          'Los datos financieros permanecen mientras exista el hogar o hasta que se solicite su eliminación.'
        )}</p>
        <small>{l(
          'Convites expiram em 7 dias. Itens pessoais podem ser excluídos separadamente.',
          'Invites expire after 7 days. Private items can be deleted separately.',
          'Las invitaciones vencen en 7 días. Los elementos privados pueden eliminarse por separado.'
        )}</small>
      </article>

      <article className="privacy-card">
        <span>{l('EXPORTAR','EXPORT','EXPORTAR')}</span>
        <h2>{l('Leve seus dados com você','Take your data with you','Lleva tus datos contigo')}</h2>
        <p>{l(
          'O arquivo JSON contém dados estruturados e metadados. Os originais permanecem disponíveis de forma autenticada no Cofre.',
          'The JSON file contains structured data and metadata. Originals remain available through authenticated access in the Vault.',
          'El archivo JSON contiene datos estructurados y metadatos. Los originales siguen disponibles con acceso autenticado en el Cofre.'
        )}</p>
        <div className="privacy-actions">
          <button className="primary-button" disabled={Boolean(working)} onClick={()=>void doExport('accessible')}>{working==='export-accessible'?l('Preparando…','Preparing…','Preparando…'):l('Baixar dados que posso ver','Download data I can see','Descargar datos que puedo ver')}</button>
          <button className="ghost-button" disabled={Boolean(working)} onClick={()=>void doExport('personal')}>{l('Só Pessoal','Private only','Solo privado')}</button>
        </div>
      </article>
    </section>

    <SecurityPanel/>

    <section className="privacy-danger-zone">
      <div className="section-title"><div><h2>{l('Exclusão','Deletion','Eliminación')}</h2><span>{l('ações irreversíveis','irreversible actions','acciones irreversibles')}</span></div></div>
      <article className="privacy-delete-card">
        <div>
          <strong>{l('Excluir meus itens Pessoais deste Lar','Delete my Private items from this household','Eliminar mis elementos Privados de este hogar')}</strong>
          <p>{l(
            'Remove registros marcados como Pessoal, inclusive originais correspondentes. Não apaga dados compartilhados do Lar.',
            'Removes records marked Private, including matching originals. It does not delete shared household data.',
            'Elimina registros marcados como Privados, incluidos los originales correspondientes. No elimina los datos compartidos del hogar.'
          )}</p>
        </div>
        <label>{l('Digite','Type','Escribe')} <b>{personalPhrase}</b><input className="premium-input" value={personalConfirm} onChange={e=>setPersonalConfirm(e.target.value)} autoComplete="off"/></label>
        <button className="danger-button" disabled={working==='personal-delete'||personalConfirm!==personalPhrase} onClick={()=>void deletePersonal()}>{working==='personal-delete'?l('Excluindo…','Deleting…','Eliminando…'):l('Excluir Pessoal','Delete Private','Eliminar Privado')}</button>
      </article>

      {role==='owner'&&<article className="privacy-delete-card critical">
        <div>
          <strong>{l('Excluir o Lar inteiro','Delete the entire household','Eliminar todo el hogar')}</strong>
          <p>{l(
            'Apaga dados compartilhados, itens pessoais dentro deste Lar, evidências e acessos. Conexões Open Finance são revogadas antes da exclusão.',
            'Deletes shared data, private items inside this household, evidence and access. Open Finance connections are revoked before deletion.',
            'Elimina datos compartidos, elementos privados dentro de este hogar, evidencias y accesos. Las conexiones de Open Finance se revocan antes de la eliminación.'
          )}</p>
        </div>
        <label>{l('Digite exatamente','Type exactly','Escribe exactamente')} <b>{householdName}</b><input className="premium-input" value={householdConfirm} onChange={e=>setHouseholdConfirm(e.target.value)} autoComplete="off"/></label>
        <button className="danger-button" disabled={working==='household-delete'||householdConfirm!==householdName} onClick={()=>void deleteLar()}>{working==='household-delete'?l('Revogando e excluindo…','Revoking & deleting…','Revocando y eliminando…'):l('Excluir Lar permanentemente','Delete household permanently','Eliminar hogar permanentemente')}</button>
      </article>}
    </section>

    <section className="household-safety-note">
      <strong>{l('Conta autenticada','Authenticated account','Cuenta autenticada')}: {user.email||user.displayName||l('usuário atual','current user','usuario actual')}</strong>
      <p>{l(
        'Exportações, exclusões e mudanças de segurança ficam registradas em auditoria sem copiar desnecessariamente o conteúdo financeiro para logs.',
        'Exports, deletions and security changes are audited without unnecessarily copying financial content into logs.',
        'Las exportaciones, eliminaciones y cambios de seguridad quedan auditados sin copiar innecesariamente contenido financiero en los registros.'
      )}</p>
    </section>
  </main>;
}
