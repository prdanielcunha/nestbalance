'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { UniversalCapture } from '@/src/features/capture/universal-capture';
import type { HouseholdRole } from '@/src/core/household';

function AddFlow({householdId,uid,role}:{householdId:string;uid:string;role:HouseholdRole}){
  const router=useRouter();
  const done=()=>router.replace('/');

  if(role==='read_only'){
    return <main className="center-shell"><section className="login-card">
      <div>
        <div className="eyebrow">Somente leitura</div>
        <h1>Este acesso é para consulta.</h1>
        <p>Você pode ver o Lar, movimentos, documentos e o assistente, mas não criar ou alterar registros financeiros.</p>
      </div>
      <Link className="primary-button readonly-home-link" href="/">Voltar ao início</Link>
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
