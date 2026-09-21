'use client';
import { useEffect, useRef, useState } from 'react';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { acceptHouseholdInvite } from '@/src/lib/repositories/household';

function InviteAcceptance(){
  const started=useRef(false);
  const [status,setStatus]=useState<'working'|'error'>('working');
  const [message,setMessage]=useState('Entrando no Lar…');

  useEffect(()=>{
    if(started.current) return;
    started.current=true;
    const token=new URLSearchParams(window.location.search).get('token')||'';
    if(!token){
      setStatus('error');
      setMessage('Este convite não tem um código válido.');
      return;
    }
    void acceptHouseholdInvite(token).then(()=>{
      window.location.assign('/household');
    }).catch((err:any)=>{
      const code=String(err?.message||'');
      const copy:Record<string,string>={
        INVITE_EXPIRED:'Este convite expirou. Peça um novo link.',
        INVITE_EMAIL_MISMATCH:'Este convite foi criado para outro e-mail.',
        INVITE_NOT_FOUND:'Este convite não existe mais.',
        INVITE_NOT_AVAILABLE:'Este convite já foi utilizado ou cancelado.'
      };
      setStatus('error');
      setMessage(copy[code]||'Não conseguimos aceitar este convite.');
    });
  },[]);

  return <main className="center-shell"><section className="login-card">
    <div><div className="eyebrow">NestBalance</div><h1>{status==='working'?'Abrindo seu Lar':'Convite indisponível'}</h1><p>{message}</p></div>
    {status==='error'&&<button className="primary-button" onClick={()=>window.location.assign('/')}>Ir para o NestBalance</button>}
  </section></main>;
}

export default function InvitePage(){
  return <AuthGate>{()=><InviteAcceptance/>}</AuthGate>;
}
