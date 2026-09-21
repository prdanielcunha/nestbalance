'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { completeOpenFinanceConnection } from '@/src/lib/repositories/open-finance';

function CallbackContent({householdId}:{householdId:string}){
  const query=useSearchParams();
  const [state,setState]=useState<'working'|'done'|'syncing'|'exit'|'error'>('working');
  const [message,setMessage]=useState('Confirmando sua conexão segura…');

  useEffect(()=>{
    const outcome=query.get('outcome')||'';
    const sessionId=query.get('session')||'';
    const linkId=query.get('link')||'';

    if(outcome==='exit'){
      setState('exit');
      setMessage('A conexão foi cancelada. Nenhum dado bancário foi importado.');
      return;
    }
    if(outcome==='event'){
      setState('error');
      setMessage('A instituição informou que a conexão não foi concluída.');
      return;
    }
    if(outcome!=='success'||!sessionId||!linkId){
      setState('error');
      setMessage('Não conseguimos confirmar essa conexão.');
      return;
    }

    let active=true;
    void completeOpenFinanceConnection({householdId,sessionId,linkId})
      .then(result=>{
        if(!active) return;
        if(result.status==='ready'){
          setState('done');
          setMessage(`${result.institutionName} conectado. ${result.synced} conta${result.synced===1?'':'s'} sincronizada${result.synced===1?'':'s'}.`);
        }else{
          setState('syncing');
          setMessage(`${result.institutionName} foi conectado. Os dados autorizados ainda estão sendo preparados.`);
        }
      })
      .catch(()=>{
        if(!active) return;
        setState('error');
        setMessage('O consentimento foi concluído, mas não conseguimos finalizar a conexão no NestBalance.');
      });

    return ()=>{active=false;};
  },[householdId,query]);

  return <main className="center-shell">
    <section className="login-card bank-callback-card">
      <div className={state==='done'?'connection-orb success':state==='error'?'connection-orb error':'connection-orb'} aria-hidden="true"/>
      <div>
        <div className="eyebrow">Open Finance</div>
        <h1>{state==='done'?'Conta conectada':state==='exit'?'Conexão cancelada':state==='error'?'Não concluímos':'Conectando…'}</h1>
        <p>{message}</p>
      </div>
      {state!=='working'&&<Link className="primary-button callback-home-button" href="/accounts">Voltar para Contas</Link>}
    </section>
  </main>;
}

export default function BankingCallbackPage(){
  return <AuthGate>{({householdId})=><CallbackContent householdId={householdId}/>}</AuthGate>;
}
