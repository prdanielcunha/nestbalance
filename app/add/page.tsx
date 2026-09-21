'use client';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/src/features/auth/auth-gate';
import { UniversalCapture } from '@/src/features/capture/universal-capture';

function AddFlow({householdId,uid}:{householdId:string;uid:string}){
  const router=useRouter();
  const done=()=>router.replace('/');
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
  return <AuthGate>{({householdId,user})=><AddFlow householdId={householdId} uid={user.uid}/>}</AuthGate>;
}
