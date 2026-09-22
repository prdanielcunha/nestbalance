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
  updateHouseholdLocale,
  updateHouseholdMemberRole,
  updateProactivityPreferences,
  type HouseholdSettingsPayload
} from '@/src/lib/repositories/household';
import { selectHousehold, type HouseholdSessionOption } from '@/src/lib/repositories/session';
import { localeLabel, type AppLocale } from '@/src/core/locale';
import { useI18n } from '@/src/i18n/locale-provider';
import { DEFAULT_PROACTIVITY_PREFERENCES, type ProactivityPreferences } from '@/src/core/proactivity';

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
  const [locale,setLocale]=useState<AppLocale>('pt-BR');
  const [savingLocale,setSavingLocale]=useState(false);
  const [proactivity,setProactivity]=useState<ProactivityPreferences>(DEFAULT_PROACTIVITY_PREFERENCES);
  const [savingProactivity,setSavingProactivity]=useState(false);
  const {t,locale:activeLocale,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>activeLocale==='en'?en:activeLocale==='es'?es:pt;

  async function refresh(){
    setLoading(true);
    setError('');
    try{
      const next=await loadHouseholdSettings(householdId);
      setData(next);
      setName(next.household.name);
      setLocale(next.household.locale);
      setProactivity(next.proactivityPreferences||DEFAULT_PROACTIVITY_PREFERENCES);
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

  async function saveLocale(){
    if(!canManage||savingLocale||!data||locale===data.household.locale) return;
    setSavingLocale(true); setError('');
    try{
      await updateHouseholdLocale(householdId,locale);
      window.location.reload();
    }catch(err:any){
      setError(String(err?.message||'Não conseguimos atualizar o idioma.'));
      setLocale(data.household.locale);
    }finally{setSavingLocale(false);}
  }

  function personName(uid:string|null){
    if(!uid) return activeLocale==='en'?'NestBalance':activeLocale==='es'?'NestBalance':'NestBalance';
    if(uid===user.uid) return activeLocale==='en'?'You':activeLocale==='es'?'Tú':'Você';
    const member=data?.members.find(item=>item.uid===uid);
    return member?.displayName||member?.email||(activeLocale==='en'?'A household member':activeLocale==='es'?'Una persona del hogar':'Uma pessoa do Lar');
  }

  function activityText(type:string,targetUid:string|null,scope:'household'|'personal'){
    const target=personName(targetUid);
    if(activeLocale==='en'){
      if(type==='household.renamed') return 'updated the household name.';
      if(type==='household.locale_changed') return 'changed the household language.';
      if(type==='household.invite_created') return 'created a household invite.';
      if(type==='household.invite_revoked') return 'cancelled a household invite.';
      if(type==='household.member_role_changed') return `changed access for ${target}.`;
      if(type==='household.member_removed') return `removed ${target} from the household.`;
      if(type==='recurrence.confirmed') return 'confirmed a monthly recurring item.';
      if(type==='member.proactivity_preferences_updated') return 'updated personal attention preferences.';
      if(type.startsWith('capture.')) return scope==='personal'?'added a private financial record.':'added a household financial record.';
      if(type.includes('payment')) return 'updated a payment.';
      if(type.includes('invoice')) return 'updated a card statement.';
      if(type.includes('account')) return 'updated an account.';
      return 'made an important household update.';
    }
    if(activeLocale==='es'){
      if(type==='household.renamed') return 'actualizó el nombre del hogar.';
      if(type==='household.locale_changed') return 'cambió el idioma del hogar.';
      if(type==='household.invite_created') return 'creó una invitación al hogar.';
      if(type==='household.invite_revoked') return 'canceló una invitación al hogar.';
      if(type==='household.member_role_changed') return `cambió el acceso de ${target}.`;
      if(type==='household.member_removed') return `eliminó a ${target} del hogar.`;
      if(type==='recurrence.confirmed') return 'confirmó un gasto mensual recurrente.';
      if(type==='member.proactivity_preferences_updated') return 'actualizó sus preferencias personales de atención.';
      if(type.startsWith('capture.')) return scope==='personal'?'agregó un registro financiero privado.':'agregó un registro financiero del hogar.';
      if(type.includes('payment')) return 'actualizó un pago.';
      if(type.includes('invoice')) return 'actualizó un resumen de tarjeta.';
      if(type.includes('account')) return 'actualizó una cuenta.';
      return 'hizo una actualización importante en el hogar.';
    }
    if(type==='household.renamed') return 'atualizou o nome do Lar.';
    if(type==='household.locale_changed') return 'alterou o idioma do Lar.';
    if(type==='household.invite_created') return 'criou um convite para o Lar.';
    if(type==='household.invite_revoked') return 'cancelou um convite do Lar.';
    if(type==='household.member_role_changed') return `alterou o acesso de ${target}.`;
    if(type==='household.member_removed') return `removeu ${target} do Lar.`;
    if(type==='recurrence.confirmed') return 'confirmou um item recorrente mensal.';
    if(type==='member.proactivity_preferences_updated') return 'atualizou suas preferências pessoais de atenção.';
    if(type.startsWith('capture.')) return scope==='personal'?'adicionou um registro financeiro pessoal.':'adicionou um registro financeiro do Lar.';
    if(type.includes('payment')) return 'atualizou um pagamento.';
    if(type.includes('invoice')) return 'atualizou uma fatura.';
    if(type.includes('account')) return 'atualizou uma conta.';
    return 'fez uma atualização importante no Lar.';
  }

  async function toggleProactivity(key:keyof ProactivityPreferences){
    if(savingProactivity) return;
    const previous=proactivity;
    const next={...previous,[key]:!previous[key]};
    setProactivity(next);
    setSavingProactivity(true);
    setError('');
    try{
      const result=await updateProactivityPreferences({householdId,preferences:next});
      setProactivity(result.preferences);
    }catch{
      setProactivity(previous);
      setError(l(
        'Não conseguimos atualizar suas preferências de atenção agora.',
        'We could not update your attention preferences right now.',
        'No pudimos actualizar tus preferencias de atención ahora.'
      ));
    }finally{
      setSavingProactivity(false);
    }
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
        <div className="section-title"><div><h2>{t.language}</h2><span>{t.languageHint}</span></div></div>
        <div className="household-inline-form">
          <select className="premium-input" value={locale} onChange={e=>setLocale(e.target.value as AppLocale)} disabled={!canManage||savingLocale}>
            <option value="pt-BR">{localeLabel('pt-BR')}</option>
            <option value="en">{localeLabel('en')}</option>
            <option value="es">{localeLabel('es')}</option>
          </select>
          {canManage&&<button className="primary-button" disabled={savingLocale||!data||locale===data.household.locale} onClick={()=>void saveLocale()}>
            {savingLocale?(activeLocale==='en'?'Saving…':activeLocale==='es'?'Guardando…':'Salvando…'):t.save}
          </button>}
        </div>
        <p className="household-helper">{activeLocale==='en'?'Dates, money and the main navigation follow this language. Personal financial privacy does not change.':activeLocale==='es'?'Las fechas, el dinero y la navegación principal siguen este idioma. La privacidad financiera personal no cambia.':'Datas, dinheiro e a navegação principal seguem este idioma. A privacidade financeira pessoal não muda.'}</p>
      </section>

      <section className="household-panel proactivity-panel">
        <div className="section-title">
          <div>
            <h2>{l('O que merece sua atenção','What deserves your attention','Qué merece tu atención')}</h2>
            <span>{l('preferências só suas','your personal preferences','tus preferencias personales')}</span>
          </div>
        </div>
        <p className="household-helper">{l(
          'A Home continua calma: você escolhe quais sinais podem aparecer em destaque. Quando não houver nada importante, o NestBalance fica em silêncio.',
          'Home stays calm: you choose which signals may appear prominently. When nothing important happens, NestBalance stays quiet.',
          'La pantalla de inicio sigue tranquila: eliges qué señales pueden aparecer destacadas. Cuando no hay nada importante, NestBalance permanece en silencio.'
        )}</p>
        <div className="proactivity-options">
          {([
            ['dueBills',l('Contas vencendo','Bills coming due','Cuentas por vencer'),l('Vencidas, hoje e próximos dias.','Overdue, today and the next few days.','Vencidas, hoy y próximos días.')],
            ['anomalies',l('Valores fora do padrão','Amounts outside the usual pattern','Valores fuera de lo habitual'),l('Possíveis duplicidades e aumentos fortes.','Possible duplicates and strong increases.','Posibles duplicados y aumentos fuertes.')],
            ['spendingChanges',l('Mudança nos gastos do mês','Monthly spending changes','Cambios en los gastos del mes'),l('Só quando houver comparação suficiente.','Only when there is enough data to compare.','Solo cuando haya datos suficientes para comparar.')],
            ['installmentEnds',l('Parcelas terminando','Installments ending','Cuotas que terminan'),l('Sinal de baixa prioridade; desligado por padrão.','Low-priority signal; off by default.','Señal de baja prioridad; desactivada por defecto.')]
          ] as Array<[keyof ProactivityPreferences,string,string]>).map(([key,title,detail])=><button
            type="button"
            key={key}
            className={proactivity[key]?'proactivity-option active':'proactivity-option'}
            aria-pressed={proactivity[key]}
            disabled={savingProactivity}
            onClick={()=>void toggleProactivity(key)}
          >
            <span><strong>{title}</strong><small>{detail}</small></span>
            <b>{proactivity[key]?l('Ativo','On','Activo'):l('Desligado','Off','Desactivado')}</b>
          </button>)}
        </div>
        <small className="proactivity-footnote">{l(
          'Estas escolhas já controlam os destaques da sua Home. Notificações do aparelho, quando forem ativadas, usarão as mesmas preferências.',
          'These choices already control highlights on your Home. Device notifications, when enabled, will use the same preferences.',
          'Estas opciones ya controlan los destacados de tu Inicio. Las notificaciones del dispositivo, cuando se habiliten, usarán las mismas preferencias.'
        )}</small>
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

      <section className="household-panel household-activity-panel">
        <div className="section-title"><div><h2>{t.recentActivity}</h2><span>{t.recentActivityHint}</span></div></div>
        {data.activity.length===0
          ? <p className="household-helper">{t.noRecentActivity}</p>
          : <div className="household-activity-list">
              {data.activity.map(item=><article className="household-activity-row" key={item.id}>
                <div className="member-avatar">{personName(item.actorUid).slice(0,1).toUpperCase()}</div>
                <div>
                  <p><strong>{personName(item.actorUid)}</strong> {activityText(item.type,item.targetUid,item.scope)}</p>
                  <span>{item.createdAtMs?formatDate(item.createdAtMs,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''}{item.scope==='personal'?(activeLocale==='en'?' · private':activeLocale==='es'?' · privado':' · pessoal'):''}</span>
                </div>
              </article>)}
            </div>}
      </section>

      <section className="household-panel privacy-entry-card"><div><div className="eyebrow">Privacidade</div><h2>Lar, Pessoal e seus dados</h2><p>Veja o que é compartilhado, exporte seus dados ou controle exclusões.</p></div><Link href="/privacy" className="primary-button privacy-entry-link">Abrir privacidade</Link></section>

      <section className="household-safety-note">
        <strong>Seu papel: {roleLabel[data.currentRole]}</strong>
        <p>O servidor valida seu acesso em cada operação. Trocar botões na tela não concede permissão financeira.</p>
      </section>
    </>}
  </main>;
}
