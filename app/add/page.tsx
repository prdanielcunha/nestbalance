'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { UniversalCapture } from '@/src/features/capture/universal-capture';
import type { HouseholdRole } from '@/src/core/household';
import { useI18n } from '@/src/i18n/locale-provider';

function AddFlow({householdId,uid,role}:{householdId:string;uid:string;role:HouseholdRole}){
  const router=useRouter();
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const done=()=>router.replace('/');

  if(role==='read_only'){
    return <main className="center-shell"><section className="login-card">
      <div>
        <div className="eyebrow">{l('Somente leitura','View only','Solo lectura')}</div>
        <h1>{l('Este acesso é para consulta.','This access is for viewing.','Este acceso es para consulta.')}</h1>
        <p>{l(
          'Você pode ver o Lar, movimentos, documentos e o assistente, mas não criar ou alterar registros financeiros.',
          'You can view the Household, movements, documents and assistant, but you cannot create or change financial records.',
          'Puedes ver el Hogar, movimientos, documentos y el asistente, pero no crear ni cambiar registros financieros.'
        )}</p>
      </div>
      <Link className="primary-button readonly-home-link" href="/">{l('Voltar ao início','Back to Home','Volver al inicio')}</Link>
    </section></main>;
  }

  return <main className="center-shell capture-route-shell">
    <UniversalCapture
      householdId={householdId}
      uid={uid}
      defaultOpen
      showTrigger={false}
      onClose={done}
      onCommitted={done}
    />
  </main>;
}

export default function AddPage(){
  return <AuthGate>{({householdId,user,households})=>{
    const role=households.find(item=>item.id===householdId)?.role||'read_only';
    return <AddFlow householdId={householdId} uid={user.uid} role={role}/>;
  }}</AuthGate>;
}
