'use client';
import { useEffect, useRef, useState } from 'react';
import { AuthOnlyGate } from '@/src/features/auth/auth-gate';
import { acceptHouseholdInvite } from '@/src/lib/repositories/household';
import { useI18n } from '@/src/i18n/locale-provider';

function InviteAcceptance(){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const started=useRef(false);
  const [status,setStatus]=useState<'working'|'error'>('working');
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

    void acceptHouseholdInvite(token).then(()=>{
      window.location.assign('/household');
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

  return <main className="center-shell"><section className="login-card">
    <div>
      <div className="eyebrow">NestBalance</div>
      <h1>{status==='working'
        ? l('Abrindo seu Lar','Opening your Household','Abriendo tu Hogar')
        : l('Convite indisponível','Invite unavailable','Invitación no disponible')}</h1>
      <p>{message}</p>
    </div>
    {status==='error'&&<button className="primary-button" onClick={()=>window.location.assign('/')}>
      {l('Ir para o NestBalance','Go to NestBalance','Ir a NestBalance')}
    </button>}
  </section></main>;
}

export default function InvitePage(){
  return <AuthOnlyGate>{()=><InviteAcceptance/>}</AuthOnlyGate>;
}
