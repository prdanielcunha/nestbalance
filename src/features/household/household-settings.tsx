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
import { PwaInstallCard } from '@/src/features/pwa/pwa-install-card';
import { ThemeChoice } from '@/src/features/theme/theme-runtime';
import { canHouseholdRole, type HouseholdRole } from '@/src/core/household';
import { AppShell } from '@/src/features/navigation/app-shell';
import { householdRoleDescription, householdRoleName } from '@/src/features/household/household-copy';
import { HouseholdPeoplePanel } from '@/src/features/household/household-people-panel';
import { HouseholdActivityPanel } from '@/src/features/household/household-activity-panel';
import { HouseholdCollaborationCard } from '@/src/features/household/household-collaboration-card';


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
  const [inviteRole,setInviteRole]=useState<Exclude<HouseholdRole,'owner'>>('member');
  const [inviteLink,setInviteLink]=useState('');
  const [inviteCopied,setInviteCopied]=useState(false);
  const [creatingInvite,setCreatingInvite]=useState(false);
  const [workingMember,setWorkingMember]=useState('');
  const [workingInvite,setWorkingInvite]=useState('');
  const [locale,setLocale]=useState<AppLocale>('pt-BR');
  const [savingLocale,setSavingLocale]=useState(false);
  const [proactivity,setProactivity]=useState<ProactivityPreferences>(DEFAULT_PROACTIVITY_PREFERENCES);
  const [savingProactivity,setSavingProactivity]=useState(false);
  const {t,locale:activeLocale,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>activeLocale==='en'?en:activeLocale==='es'?es:pt;
  const roleName=(role:HouseholdRole)=>householdRoleName(role,activeLocale);
  const roleDescription=(role:Exclude<HouseholdRole,'owner'>)=>householdRoleDescription(role,activeLocale);

  const inviteRoles:Exclude<HouseholdRole,'owner'>[]=['admin','manager','member','read_only'];

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
      setError(l('Não conseguimos abrir as configurações do Lar agora.','We could not open Household settings right now.','No pudimos abrir la configuración del Hogar ahora.'));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void refresh();},[householdId]);

  const canManage=data?canHouseholdRole(data.currentRole,'manage_household'):false;
  const currentSession=useMemo(()=>sessionHouseholds.find(item=>item.id===householdId),[sessionHouseholds,householdId]);

  async function switchHousehold(nextId:string){
    if(nextId===householdId) return;
    setError('');
    try{
      await selectHousehold(nextId);
      window.location.assign('/household');
    }catch(err:any){
      setError(l('Não conseguimos trocar de Lar agora.','We could not switch Household right now.','No pudimos cambiar de Hogar ahora.'));
    }
  }

  async function saveName(){
    if(!canManage||savingName||name.trim().length<2) return;
    setSavingName(true); setError('');
    try{
      await renameHousehold(householdId,name.trim());
      await refresh();
    }catch(err:any){
      setError(l('Não conseguimos atualizar o nome agora.','We could not update the name right now.','No pudimos actualizar el nombre ahora.'));
    }finally{setSavingName(false);}
  }

  async function saveLocale(){
    if(!canManage||savingLocale||!data||locale===data.household.locale) return;
    setSavingLocale(true); setError('');
    try{
      await updateHouseholdLocale(householdId,locale);
      window.location.reload();
    }catch(err:any){
      setError(l('Não conseguimos atualizar o idioma agora.','We could not update the language right now.','No pudimos actualizar el idioma ahora.'));
      setLocale(data.household.locale);
    }finally{setSavingLocale(false);}
  }

  function personName(uid:string|null){
    if(!uid) return activeLocale==='en'?'NestBalance':activeLocale==='es'?'NestBalance':'NestBalance';
    if(uid===user.uid) return activeLocale==='en'?'You':activeLocale==='es'?'Tú':'Você';
    const member=data?.members.find(item=>item.uid===uid);
    return member?.displayName||member?.email||(activeLocale==='en'?'A household member':activeLocale==='es'?'Una persona del hogar':'Uma pessoa do Lar');
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

  async function copyInvite(link=inviteLink){
    if(!link) return;
    try{
      if(!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
    }catch{
      setInviteCopied(false);
    }
  }

  async function shareInvite(){
    if(!inviteLink) return;
    const title=l('Convite do NestBalance','NestBalance invitation','Invitación de NestBalance');
    const shareText=l(
      `Quero compartilhar meu NestBalance com você como ${roleName(inviteRole)}.`,
      `I want to share my NestBalance with you as ${roleName(inviteRole)}.`,
      `Quiero compartir mi NestBalance contigo como ${roleName(inviteRole)}.`
    );
    try{
      if(navigator.share){
        await navigator.share({title,text:shareText,url:inviteLink});
        return;
      }
    }catch(err:any){
      if(String(err?.name||'')==='AbortError') return;
    }
    await copyInvite(inviteLink);
  }

  async function makeInvite(){
    if(!canManage||creatingInvite) return;
    setCreatingInvite(true); setError(''); setInviteLink(''); setInviteCopied(false);
    try{
      const result=await createHouseholdInvite({
        householdId,
        role:inviteRole,
        email:inviteEmail.trim()||undefined
      });
      const link=`${window.location.origin}/invite?token=${encodeURIComponent(result.token)}`;
      setInviteLink(link);
      await copyInvite(link);
      await refresh();
    }catch(err:any){
      const code=String(err?.message||'');
      setError(code==='INVALID_INVITE_EMAIL'
        ? l('Confira o e-mail informado.','Check the email address.','Revisa el correo informado.')
        : l('Não conseguimos criar o convite.','We could not create the invite.','No pudimos crear la invitación.'));
    }finally{setCreatingInvite(false);}
  }

  async function changeRole(uid:string,role:Exclude<HouseholdRole,'owner'>){
    if(!canManage||workingMember) return;
    setWorkingMember(uid); setError('');
    try{
      await updateHouseholdMemberRole({householdId,uid,role});
      await refresh();
    }catch(err:any){
      setError(l('Não conseguimos atualizar esse acesso agora.','We could not update this access right now.','No pudimos actualizar este acceso ahora.'));
    }finally{setWorkingMember('');}
  }

  async function revokeInvite(inviteId:string){
    if(!canManage||workingInvite) return;
    setWorkingInvite(inviteId); setError('');
    try{
      await revokeHouseholdInvite({householdId,inviteId});
      await refresh();
    }catch(err:any){
      setError(l('Não conseguimos cancelar esse convite agora.','We could not cancel this invite right now.','No pudimos cancelar esta invitación ahora.'));
    }finally{setWorkingInvite('');}
  }

  async function remove(uid:string){
    if(!canManage||workingMember) return;
    setWorkingMember(uid); setError('');
    try{
      await removeHouseholdMember({householdId,uid});
      await refresh();
    }catch(err:any){
      setError(l('Não conseguimos remover esse membro agora.','We could not remove this member right now.','No pudimos eliminar este miembro ahora.'));
    }finally{setWorkingMember('');}
  }

  return <AppShell
    className="household-shell"
    subtitle={l('Compartilhar e acessos','Sharing & access','Compartir y accesos')}
    canContribute={(currentSession?.role||'read_only')!=='read_only'}
    householdLink="none"
    headerActions={<Link href="/" className="household-back">{l('Voltar','Back','Volver')}</Link>}
  >
    <section className="area-hero household-hero">
      <span>{l('Sua vida financeira pode ser compartilhada sem compartilhar senha.','Share your financial life without sharing a password.','Comparte tu vida financiera sin compartir contraseña.')}</span>
      <h1>{data?.household.name||currentSession?.name||l('Seu Lar','Your Household','Tu Hogar')}</h1>
      <p>{l('Cada pessoa entra com a própria conta. Nada de senha compartilhada, autoria perdida ou dúvida sobre quem fez o quê.','Each person signs in with their own account. No shared passwords, lost authorship, or uncertainty about who changed what.','Cada persona entra con su propia cuenta. Sin contraseñas compartidas, autoría perdida ni dudas sobre quién cambió qué.')}</p>
    </section>

    <HouseholdCollaborationCard/>

    {sessionHouseholds.length>1&&<section className="household-switcher">
      <div className="section-title"><h2>{l('Seus espaços','Your spaces','Tus espacios')}</h2><span>{sessionHouseholds.length} {l('disponíveis','available','disponibles')}</span></div>
      <div className="household-choice-grid">
        {sessionHouseholds.map(item=><button
          key={item.id}
          className={item.id===householdId?'household-choice active':'household-choice'}
          onClick={()=>void switchHousehold(item.id)}
        >
          <strong>{item.name}</strong>
          <span>{roleName(item.role)}</span>
        </button>)}
      </div>
    </section>}

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {loading&&<div className="home-loading-line" aria-label={l('Carregando Lar','Loading Household','Cargando Hogar')}/>} 

    {!loading&&data&&<>
      <section className="household-panel">
        <div className="section-title"><div><h2>{l('Identidade do Lar','Household identity','Identidad del Hogar')}</h2><span>{l('o nome que aparece para todos','the name everyone sees','el nombre que todos ven')}</span></div></div>
        <div className="household-inline-form">
          <input className="premium-input" value={name} onChange={e=>setName(e.target.value)} disabled={!canManage||savingName} maxLength={60}/>
          {canManage&&<button className="primary-button" disabled={savingName||name.trim().length<2||name.trim()===data.household.name} onClick={()=>void saveName()}>
            {savingName?l('Salvando…','Saving…','Guardando…'):l('Salvar','Save','Guardar')}
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

      <section className="household-panel">
        <div className="section-title">
          <div>
            <h2>{l('Aparência','Appearance','Apariencia')}</h2>
            <span>{l('uma preferência só sua','a personal preference','una preferencia personal')}</span>
          </div>
        </div>
        <p className="household-helper">{l(
          'O modo escuro é o visual oficial do NestBalance. Se você preferir, pode usar o modo claro; sua escolha fica salva neste aparelho.',
          'Dark mode is the official NestBalance look. If you prefer, you can use light mode; your choice stays saved on this device.',
          'El modo oscuro es el aspecto oficial de NestBalance. Si prefieres, puedes usar el modo claro; tu elección queda guardada en este dispositivo.'
        )}</p>
        <ThemeChoice/>
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

      <HouseholdPeoplePanel
        members={data.members}
        userUid={user.uid}
        canManage={canManage}
        workingMember={workingMember}
        onRoleChange={changeRole}
        onRemove={remove}
      />

      {canManage&&<section className="household-panel invite-panel">
        <div className="section-title"><div><h2>{l('Compartilhar este Lar','Share this Household','Compartir este Hogar')}</h2><span>{l('cada pessoa usa o próprio login','everyone uses their own sign-in','cada persona usa su propio acceso')}</span></div></div>
        <p className="household-helper">{l(
          'Escolha o nível de acesso antes de enviar. Você pode mudar depois, sem precisar criar outro convite.',
          'Choose the access level before sending. You can change it later without creating another invitation.',
          'Elige el nivel de acceso antes de enviarlo. Puedes cambiarlo después sin crear otra invitación.'
        )}</p>
        <div className="access-role-grid" role="radiogroup" aria-label={l('Nível de acesso','Access level','Nivel de acceso')}>
          {inviteRoles.map(role=><button
            type="button"
            key={role}
            role="radio"
            aria-checked={inviteRole===role}
            className={inviteRole===role?'access-role-card active':'access-role-card'}
            onClick={()=>{setInviteRole(role);setInviteLink('');setInviteCopied(false);}}
          >
            <span><strong>{roleName(role)}</strong><small>{roleDescription(role)}</small></span>
            <b>{inviteRole===role?l('Selecionado','Selected','Seleccionado'):''}</b>
          </button>)}
        </div>
        <div className="invite-grid invite-identity-grid">
          <label><span>{l('E-mail da pessoa (opcional)','Person’s email (optional)','Correo de la persona (opcional)')}</span><input className="premium-input" value={inviteEmail} onChange={e=>{setInviteEmail(e.target.value);setInviteLink('');setInviteCopied(false);}} placeholder={l('pessoa@exemplo.com','person@example.com','persona@ejemplo.com')} inputMode="email"/></label>
          <div className="invite-security-copy"><strong>{roleName(inviteRole)}</strong><span>{l('Convites expiram em 7 dias. Com e-mail, só aquela conta pode aceitar.','Invites expire in 7 days. With an email, only that account can accept.','Las invitaciones vencen en 7 días. Con correo, solo esa cuenta puede aceptar.')}</span></div>
        </div>
        <button className="primary-button" disabled={creatingInvite} onClick={()=>void makeInvite()}>
          {creatingInvite?l('Criando convite…','Creating invitation…','Creando invitación…'):l('Criar convite seguro','Create secure invitation','Crear invitación segura')}
        </button>
        {inviteLink&&<div className="invite-link-card">
          <div className="invite-link-copy">
            <strong>{inviteCopied
              ? l('Convite pronto e copiado','Invitation ready and copied','Invitación lista y copiada')
              : l('Convite pronto para compartilhar','Invitation ready to share','Invitación lista para compartir')}</strong>
            <span>{roleName(inviteRole)} · {l('não compartilhe este link publicamente','do not post this link publicly','no publiques este enlace')}</span>
          </div>
          <button className="primary-button" onClick={()=>void shareInvite()}>{l('Compartilhar','Share','Compartir')}</button>
          <button className="ghost-button" onClick={()=>void copyInvite()}>{inviteCopied
            ? l('Copiar novamente','Copy again','Copiar de nuevo')
            : l('Copiar link','Copy link','Copiar enlace')}</button>
        </div>}
        {data.invites.length>0&&<div className="pending-invites">
          <span>{l('Convites pendentes','Pending invites','Invitaciones pendientes')}</span>
          {data.invites.map(invite=><div key={invite.id}>
            <div><strong>{invite.email||l('Link sem e-mail restrito','Link without email restriction','Enlace sin restricción de correo')}</strong>
            <small>{roleName(invite.role)} · {invite.expired?l('expirado','expired','vencido'):`${l('até','until','hasta')} ${formatDate(invite.expiresAtMs,{day:'2-digit',month:'2-digit',year:'numeric'})}`}</small></div>
            <button className="member-remove" disabled={Boolean(workingInvite)} onClick={()=>void revokeInvite(invite.id)}>
              {workingInvite===invite.id?l('Cancelando…','Cancelling…','Cancelando…'):l('Cancelar','Cancel','Cancelar')}
            </button>
          </div>)}
        </div>}
      </section>}

      <HouseholdActivityPanel activity={data.activity} personName={personName}/>

      <PwaInstallCard/>

      <section className="household-panel privacy-entry-card"><div><div className="eyebrow">{l('Privacidade','Privacy','Privacidad')}</div><h2>{l('Lar, Pessoal e seus dados','Household, Personal and your data','Hogar, Personal y tus datos')}</h2><p>{l('Veja o que é compartilhado, exporte seus dados ou controle exclusões.','See what is shared, export your data, or control deletions.','Consulta qué se comparte, exporta tus datos o controla eliminaciones.')}</p></div><Link href="/privacy" className="primary-button privacy-entry-link">{l('Abrir privacidade','Open privacy','Abrir privacidad')}</Link></section>

      <section className="household-safety-note">
        <strong>{l('Seu papel','Your role','Tu rol')}: {roleName(data.currentRole)}</strong>
        <p>{l('O servidor valida seu acesso em cada operação. Trocar botões na tela não concede permissão financeira.','The server validates your access on every operation. Changing controls in the interface never grants financial permission.','El servidor valida tu acceso en cada operación. Cambiar controles en la interfaz no concede permisos financieros.')}</p>
      </section>
    </>}
  </AppShell>;
}
