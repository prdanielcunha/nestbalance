'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  createHouseholdInvite,
  loadHouseholdSettings,
  removeHouseholdMember,
  renameHousehold,
  revokeHouseholdInvite,
  updateHouseholdMemberRole,
  type HouseholdSettingsPayload
} from '@/src/lib/repositories/household';
import { selectHousehold, type HouseholdSessionOption } from '@/src/lib/repositories/session';

const roleLabel={
  owner:'Dono do Lar',
  admin:'Administrador',
  member:'Membro',
  read_only:'Somente leitura'
} as const;

export function HouseholdSettings({
  householdId,
  sessionHouseholds,
  user
}:{
  householdId:string;
  sessionHouseholds:HouseholdSessionOption[];
  user:User;
}){
  const [data,setData]=useState<HouseholdSettingsPayload|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [name,setName]=useState('');
  const [savingName,setSavingName]=useState(false);
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteRole,setInviteRole]=useState<'admin'|'member'|'read_only'>('member');
  const [inviteLink,setInviteLink]=useState('');
  const [creatingInvite,setCreatingInvite]=useState(false);
  const [workingMember,setWorkingMember]=useState('');
  const [workingInvite,setWorkingInvite]=useState('');

  async function refresh(){
    setLoading(true);
    setError('');
    try{
      const next=await loadHouseholdSettings(householdId);
      setData(next);
      setName(next.household.name);
    }catch(err:any){
      setError(String(err?.message||'Não conseguimos abrir as configurações do Lar.'));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void refresh();},[householdId]);

  const canManage=data?.currentRole==='owner'||data?.currentRole==='admin';
  const currentSession=useMemo(()=>sessionHouseholds.find(item=>item.id===householdId),[sessionHouseholds,householdId]);

  async function switchHousehold(nextId:string){
    if(nextId===householdId) return;
    setError('');
    try{
      await selectHousehold(nextId);
      window.location.assign('/household');
    }catch(err:any){
      setError(String(err?.message||'Não conseguimos trocar de Lar.'));
    }
  }

  async function saveName(){
    if(!canManage||savingName||name.trim().length<2) return;
    setSavingName(true); setError('');
    try{
      await renameHousehold(householdId,name.trim());
      await refresh();
    }catch(err:any){
      setError(String(err?.message||'Não conseguimos atualizar o nome.'));
    }finally{setSavingName(false);}
  }

  async function makeInvite(){
    if(!canManage||creatingInvite) return;
    setCreatingInvite(true); setError(''); setInviteLink('');
    try{
      const result=await createHouseholdInvite({
        householdId,
        role:inviteRole,
        email:inviteEmail.trim()||undefined
      });
      const link=`${window.location.origin}/invite?token=${encodeURIComponent(result.token)}`;
      setInviteLink(link);
      await navigator.clipboard?.writeText(link).catch(()=>undefined);
      await refresh();
    }catch(err:any){
      const code=String(err?.message||'');
      setError(code==='INVALID_INVITE_EMAIL'?'Confira o e-mail informado.':'Não conseguimos criar o convite.');
    }finally{setCreatingInvite(false);}
  }

  async function changeRole(uid:string,role:'admin'|'member'|'read_only'){
    if(!canManage||workingMember) return;
    setWorkingMember(uid); setError('');
    try{
      await updateHouseholdMemberRole({householdId,uid,role});
      await refresh();
    }catch(err:any){
      setError(String(err?.message||'Não conseguimos atualizar esse acesso.'));
    }finally{setWorkingMember('');}
  }

  async function revokeInvite(inviteId:string){
    if(!canManage||workingInvite) return;
    setWorkingInvite(inviteId); setError('');
    try{
      await revokeHouseholdInvite({householdId,inviteId});
      await refresh();
    }catch(err:any){
      setError(String(err?.message||'Não conseguimos cancelar esse convite.'));
    }finally{setWorkingInvite('');}
  }

  async function remove(uid:string){
    if(!canManage||workingMember) return;
    setWorkingMember(uid); setError('');
    try{
      await removeHouseholdMember({householdId,uid});
      await refresh();
    }catch(err:any){
      setError(String(err?.message||'Não conseguimos remover esse membro.'));
    }finally{setWorkingMember('');}
  }

  return <main className="app-shell household-shell">
    <header className="topbar">
      <div>
        <div className="eyebrow">NestBalance</div>
        <span className="topbar-subtitle">Lar e acessos</span>
      </div>
      <Link href="/" className="household-back">Voltar</Link>
    </header>

    <section className="area-hero household-hero">
      <span>Uma casa. Uma verdade financeira.</span>
      <h1>{data?.household.name||currentSession?.name||'Seu Lar'}</h1>
      <p>Cada pessoa entra com a própria conta. Nada de senha compartilhada, autoria perdida ou dúvida sobre quem fez o quê.</p>
    </section>

    {sessionHouseholds.length>1&&<section className="household-switcher">
      <div className="section-title"><h2>Seus espaços</h2><span>{sessionHouseholds.length} disponíveis</span></div>
      <div className="household-choice-grid">
        {sessionHouseholds.map(item=><button
          key={item.id}
          className={item.id===householdId?'household-choice active':'household-choice'}
          onClick={()=>void switchHousehold(item.id)}
        >
          <strong>{item.name}</strong>
          <span>{roleLabel[item.role]}</span>
        </button>)}
      </div>
    </section>}

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {loading&&<div className="home-loading-line" aria-label="Carregando Lar"/>}

    {!loading&&data&&<>
      <section className="household-panel">
        <div className="section-title"><div><h2>Identidade do Lar</h2><span>o nome que aparece para todos</span></div></div>
        <div className="household-inline-form">
          <input className="premium-input" value={name} onChange={e=>setName(e.target.value)} disabled={!canManage||savingName} maxLength={60}/>
          {canManage&&<button className="primary-button" disabled={savingName||name.trim().length<2||name.trim()===data.household.name} onClick={()=>void saveName()}>
            {savingName?'Salvando…':'Salvar'}
          </button>}
        </div>
      </section>

      <section className="household-panel">
        <div className="section-title"><div><h2>Pessoas</h2><span>{data.members.length} membro{data.members.length===1?'':'s'}</span></div></div>
        <div className="member-list">
          {data.members.map(member=><article className="member-row" key={member.uid}>
            <div className="member-avatar">{(member.displayName||member.email||'?').slice(0,1).toUpperCase()}</div>
            <div className="member-copy">
              <strong>{member.uid===user.uid?'Você':member.displayName||member.email||'Membro do Lar'}</strong>
              <span>{member.email||roleLabel[member.role]}</span>
            </div>
            <div className="member-access">
              {member.role==='owner'||!canManage
                ? <span className="role-pill">{roleLabel[member.role]}</span>
                : <select
                    value={member.role}
                    disabled={workingMember===member.uid}
                    onChange={e=>void changeRole(member.uid,e.target.value as 'admin'|'member'|'read_only')}
                    aria-label={`Acesso de ${member.displayName||member.email||'membro'}`}
                  >
                    <option value="admin">Administrador</option>
                    <option value="member">Membro</option>
                    <option value="read_only">Somente leitura</option>
                  </select>}
              {canManage&&member.role!=='owner'&&member.uid!==user.uid&&<button
                className="member-remove"
                disabled={workingMember===member.uid}
                onClick={()=>void remove(member.uid)}
              >Remover</button>}
            </div>
          </article>)}
        </div>
      </section>

      {canManage&&<section className="household-panel invite-panel">
        <div className="section-title"><div><h2>Convidar alguém</h2><span>o convite expira em 7 dias</span></div></div>
        <div className="invite-grid">
          <label><span>E-mail (opcional)</span><input className="premium-input" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="pessoa@exemplo.com" inputMode="email"/></label>
          <label><span>Acesso</span><select className="premium-input" value={inviteRole} onChange={e=>setInviteRole(e.target.value as typeof inviteRole)}>
            <option value="member">Membro</option>
            <option value="admin">Administrador</option>
            <option value="read_only">Somente leitura</option>
          </select></label>
        </div>
        <button className="primary-button" disabled={creatingInvite} onClick={()=>void makeInvite()}>
          {creatingInvite?'Criando convite…':'Criar e copiar convite'}
        </button>
        {inviteLink&&<div className="invite-link-card">
          <strong>Convite copiado</strong>
          <span>Compartilhe este link somente com a pessoa certa.</span>
          <button className="ghost-button" onClick={()=>void navigator.clipboard?.writeText(inviteLink)}>Copiar novamente</button>
        </div>}
        {data.invites.length>0&&<div className="pending-invites">
          <span>Convites pendentes</span>
          {data.invites.map(invite=><div key={invite.id}>
            <div><strong>{invite.email||'Link sem e-mail restrito'}</strong>
            <small>{roleLabel[invite.role]} · {invite.expired?'expirado':`até ${new Intl.DateTimeFormat('pt-BR').format(invite.expiresAtMs)}`}</small></div>
            <button className="member-remove" disabled={Boolean(workingInvite)} onClick={()=>void revokeInvite(invite.id)}>
              {workingInvite===invite.id?'Cancelando…':'Cancelar'}
            </button>
          </div>)}
        </div>}
      </section>}

      <section className="household-panel privacy-entry-card"><div><div className="eyebrow">Privacidade</div><h2>Lar, Pessoal e seus dados</h2><p>Veja o que é compartilhado, exporte seus dados ou controle exclusões.</p></div><Link href="/privacy" className="primary-button privacy-entry-link">Abrir privacidade</Link></section>

      <section className="household-safety-note">
        <strong>Seu papel: {roleLabel[data.currentRole]}</strong>
        <p>O servidor valida seu acesso em cada operação. Trocar botões na tela não concede permissão financeira.</p>
      </section>
    </>}
  </main>;
}
