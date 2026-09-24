'use client';
import { useEffect, useRef, useState } from 'react';
import { AuthOnlyGate } from '@/src/features/auth/auth-gate';
import { acceptHouseholdInvite } from '@/src/lib/repositories/household';
import { useI18n } from '@/src/i18n/locale-provider';

function InviteAcceptance(){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const started=useRef(false);
  const [status,setStatus]=useState<'working'|'accepted'|'error'>('working');
  const [acceptedRole,setAcceptedRole]=useState('member');
  const [message,setMessage]=useState(()=>l('Entrando no Lar…','Joining the Household…','Entrando al Hogar…'));

  useEffect(()=>{
    if(started.current) return;
    started.current=true;
    const token=new URLSearchParams(window.location.search).get('token')||'';
    if(!token){
      setStatus('error');
      setMessage(l(
        'Este convite não tem um código válido.',
        'This invite does not contain a valid code.',
        'Esta invitación no contiene un código válido.'
      ));
      return;
    }

    // Keep the one-time invite secret out of the visible URL/history once captured.
    window.history.replaceState(null,'','/invite');

    void acceptHouseholdInvite(token).then(result=>{
      setAcceptedRole(result.role);
      setStatus('accepted');
      setMessage(l(
        'Convite aceito. Antes de continuar, veja como seu acesso funciona.',
        'Invite accepted. Before continuing, see how your access works.',
        'Invitación aceptada. Antes de continuar, mira cómo funciona tu acceso.'
      ));
    }).catch((err:any)=>{
      const code=String(err?.message||'');
      const copy:Record<string,string>={
        INVITE_EXPIRED:l('Este convite expirou. Peça um novo link.','This invite expired. Ask for a new link.','Esta invitación venció. Pide un nuevo enlace.'),
        INVITE_EMAIL_MISMATCH:l('Este convite foi criado para outro e-mail.','This invite was created for another email address.','Esta invitación fue creada para otro correo.'),
        INVITE_NOT_FOUND:l('Este convite não existe mais.','This invite no longer exists.','Esta invitación ya no existe.'),
        INVITE_NOT_AVAILABLE:l('Este convite já foi utilizado ou cancelado.','This invite has already been used or cancelled.','Esta invitación ya fue utilizada o cancelada.')
      };
      setStatus('error');
      setMessage(copy[code]||l(
        'Não conseguimos aceitar este convite.',
        'We could not accept this invite.',
        'No pudimos aceptar esta invitación.'
      ));
    });
  },[]);

  const roleLabel=acceptedRole==='admin'
    ? l('Sócio · acesso total','Partner · full access','Socio · acceso total')
    : acceptedRole==='manager'
      ? l('Gestor financeiro','Financial manager','Gestor financiero')
      : acceptedRole==='read_only'
        ? l('Visualizador','Viewer','Visualizador')
        : l('Colaborador','Contributor','Colaborador');

  return <main className="center-shell"><section className="login-card invite-first-use">
    <div>
      <div className="eyebrow">NestBalance</div>
      <h1>{status==='working'
        ? l('Abrindo seu Lar','Opening your Household','Abriendo tu Hogar')
        : status==='accepted'
          ? l('Você entrou no Lar','You joined the Household','Entraste al Hogar')
          : l('Convite indisponível','Invite unavailable','Invitación no disponible')}</h1>
      <p>{message}</p>
      {status==='accepted'&&<div className="invite-role-intro">
        <div><span>{l('Seu papel','Your role','Tu rol')}</span><strong>{roleLabel}</strong></div>
        <article>
          <strong>{l('Lar','Household','Hogar')}</strong>
          <p>{l(
            'Aqui ficam apenas dados que alguém escolheu compartilhar com o grupo. Alterações mostram quem fez o quê.',
            'Only data someone chose to share with the group appears here. Changes show who did what.',
            'Aquí solo aparecen datos que alguien eligió compartir con el grupo. Los cambios muestran quién hizo qué.'
          )}</p>
        </article>
        <article>
          <strong>{l('Pessoal','Personal','Personal')}</strong>
          <p>{l(
            'Seus itens Pessoais continuam privados. Outros membros do Lar não veem valores, descrições nem documentos pessoais.',
            'Your Personal items stay private. Other Household members cannot see private amounts, descriptions, or documents.',
            'Tus elementos Personales siguen privados. Los demás miembros no ven valores, descripciones ni documentos personales.'
          )}</p>
        </article>
      </div>}
    </div>
    {status==='accepted'&&<button className="primary-button" onClick={()=>window.location.assign('/together?welcome=1')}>
      {l('Entendi · abrir Central do Lar','Got it · open Household Center','Entendido · abrir Central del Hogar')}
    </button>}
    {status==='error'&&<button className="primary-button" onClick={()=>window.location.assign('/')}>
      {l('Ir para o NestBalance','Go to NestBalance','Ir a NestBalance')}
    </button>}
  </section></main>;
}

export default function InvitePage(){
  return <AuthOnlyGate>{()=><InviteAcceptance/>}</AuthOnlyGate>;
}
