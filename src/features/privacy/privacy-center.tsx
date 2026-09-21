'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { deleteHouseholdPermanently, deleteMyPersonalData, exportPrivacyData, loadPrivacyStatus, recordPrivacyConsent, type PrivacyStatus } from '@/src/lib/repositories/privacy';

function download(blob:Blob,name:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function PrivacyCenter({householdId,user,householdName,role}:{householdId:string;user:User;householdName:string;role:string}){
  const [status,setStatus]=useState<PrivacyStatus|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [working,setWorking]=useState('');
  const [personalConfirm,setPersonalConfirm]=useState('');
  const [householdConfirm,setHouseholdConfirm]=useState('');

  async function refresh(){
    try{setStatus(await loadPrivacyStatus(householdId));setError('');}catch{setError('Não conseguimos carregar suas opções de privacidade agora.');}
  }
  useEffect(()=>{void refresh();},[householdId]);

  async function consent(){
    setWorking('consent');setError('');setNotice('');
    try{await recordPrivacyConsent(householdId);setNotice('Preferência de privacidade registrada.');await refresh();}
    catch{setError('Não conseguimos registrar isso agora.');}finally{setWorking('');}
  }
  async function doExport(mode:'accessible'|'personal'){
    setWorking('export-'+mode);setError('');setNotice('');
    try{
      const blob=await exportPrivacyData(householdId,mode);
      download(blob,`nestbalance-${mode}-${new Date().toISOString().slice(0,10)}.json`);
      setNotice(mode==='personal'?'Exportamos somente seus itens pessoais.':'Exportamos tudo que sua conta pode ver neste Lar.');
    }catch{setError('Não conseguimos preparar sua exportação agora.');}finally{setWorking('');}
  }
  async function deletePersonal(){
    if(personalConfirm!=='EXCLUIR PESSOAL') return;
    setWorking('personal-delete');setError('');setNotice('');
    try{const result=await deleteMyPersonalData(householdId);setNotice(`Itens pessoais excluídos. ${Object.values(result.counts).reduce((a,b)=>a+b,0)} registros foram removidos.`);setPersonalConfirm('');}
    catch{setError('Não conseguimos excluir seus itens pessoais agora. Nada foi apagado parcialmente pela interface.');}finally{setWorking('');}
  }
  async function deleteLar(){
    if(householdConfirm!==householdName) return;
    setWorking('household-delete');setError('');setNotice('');
    try{await deleteHouseholdPermanently(householdId,householdConfirm);window.location.assign('/');}
    catch(err:any){
      setError(String(err?.message||'')==='OPEN_FINANCE_REVOCATION_FAILED'?'Não excluímos o Lar porque uma conexão bancária ainda não pôde ser revogada com segurança.':'Não conseguimos excluir este Lar. Nenhum atalho de segurança foi usado.');
    }finally{setWorking('');}
  }

  return <main className="app-shell privacy-shell">
    <header className="topbar"><div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">Privacidade e seus dados</span></div><Link href="/household" className="household-back">Voltar</Link></header>
    <section className="area-hero privacy-hero"><span>Controle sem vigilância</span><h1>Seus dados continuam seus.</h1><p>Lar é compartilhado. Pessoal é só seu. O servidor aplica essa separação em cada leitura e escrita — não é apenas um filtro visual.</p></section>
    {error&&<p className="error-copy" role="alert">{error}</p>}{notice&&<p className="notice-copy" role="status">{notice}</p>}

    <section className="privacy-grid">
      <article className="privacy-card"><span>ESCOPO</span><h2>Lar × Pessoal</h2><p>Itens do Lar aparecem para membros autorizados. Itens marcados como “Só para mim” só aparecem na sua própria conta, mesmo para administradores do Lar.</p><div className="privacy-split"><div><strong>Lar</strong><small>verdade financeira compartilhada</small></div><div><strong>Pessoal</strong><small>isolado por usuário</small></div></div></article>
      <article className="privacy-card"><span>FINALIDADE</span><h2>Por que usamos estes dados</h2><p>Para organizar sua vida financeira, preservar evidências enviadas e calcular reconciliações/previsões que você pediu. O NestBalance não precisa de CVV nem do número completo do cartão.</p>{status&&!status.accepted?<button className="primary-button" disabled={Boolean(working)} onClick={()=>void consent()}>{working==='consent'?'Registrando…':'Confirmar que entendi'}</button>:<small className="privacy-ok">Preferência registrada{status?.acceptedAt?` em ${new Intl.DateTimeFormat('pt-BR').format(new Date(status.acceptedAt))}`:''}.</small>}</article>
      <article className="privacy-card"><span>RETENÇÃO</span><h2>Quanto tempo fica</h2><p>{status?.retention.financial||'Dados financeiros permanecem enquanto o Lar existir ou até uma exclusão solicitada.'}</p><small>Convites: {status?.retention.invites||'7 dias.'} Itens pessoais podem ser excluídos separadamente.</small></article>
      <article className="privacy-card"><span>EXPORTAR</span><h2>Leve seus dados com você</h2><p>O arquivo JSON contém dados estruturados e metadados. Os originais permanecem disponíveis de forma autenticada no Cofre.</p><div className="privacy-actions"><button className="primary-button" disabled={Boolean(working)} onClick={()=>void doExport('accessible')}>{working==='export-accessible'?'Preparando…':'Baixar dados que posso ver'}</button><button className="ghost-button" disabled={Boolean(working)} onClick={()=>void doExport('personal')}>Só Pessoal</button></div></article>
    </section>

    <section className="privacy-danger-zone">
      <div className="section-title"><div><h2>Exclusão</h2><span>ações irreversíveis</span></div></div>
      <article className="privacy-delete-card"><div><strong>Excluir meus itens Pessoais deste Lar</strong><p>Remove registros marcados como Pessoal, inclusive originais correspondentes. Não apaga dados compartilhados do Lar.</p></div><label>Digite <b>EXCLUIR PESSOAL</b><input className="premium-input" value={personalConfirm} onChange={e=>setPersonalConfirm(e.target.value)} autoComplete="off"/></label><button className="danger-button" disabled={working==='personal-delete'||personalConfirm!=='EXCLUIR PESSOAL'} onClick={()=>void deletePersonal()}>{working==='personal-delete'?'Excluindo…':'Excluir Pessoal'}</button></article>
      {role==='owner'&&<article className="privacy-delete-card critical"><div><strong>Excluir o Lar inteiro</strong><p>Apaga dados compartilhados, itens pessoais dentro deste Lar, evidências e acessos. Conexões Open Finance são revogadas antes da exclusão.</p></div><label>Digite exatamente <b>{householdName}</b><input className="premium-input" value={householdConfirm} onChange={e=>setHouseholdConfirm(e.target.value)} autoComplete="off"/></label><button className="danger-button" disabled={working==='household-delete'||householdConfirm!==householdName} onClick={()=>void deleteLar()}>{working==='household-delete'?'Revogando e excluindo…':'Excluir Lar permanentemente'}</button></article>}
    </section>
    <section className="household-safety-note"><strong>Conta autenticada: {user.email||user.displayName||'usuário atual'}</strong><p>Exportações e exclusões ficam registradas em auditoria sem copiar desnecessariamente o conteúdo financeiro para logs.</p></section>
  </main>;
}
