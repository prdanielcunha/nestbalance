'use client';

import { useState } from 'react';
import type { HouseholdRole } from '@/src/core/household';
import { useI18n } from '@/src/i18n/locale-provider';
import type { HouseholdSettingsPayload } from '@/src/lib/repositories/household';
import { householdRoleDescription, householdRoleName } from '@/src/features/household/household-copy';

export function HouseholdPeoplePanel({
  members,
  userUid,
  canManage,
  workingMember,
  onRoleChange,
  onRemove
}:{
  members:HouseholdSettingsPayload['members'];
  userUid:string;
  canManage:boolean;
  workingMember:string;
  onRoleChange:(uid:string,role:Exclude<HouseholdRole,'owner'>)=>void|Promise<void>;
  onRemove:(uid:string)=>void|Promise<void>;
}){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const roleName=(role:HouseholdRole)=>householdRoleName(role,locale);
  const [pending,setPending]=useState<{uid:string;role:Exclude<HouseholdRole,'owner'>}|null>(null);
  const pendingMember=pending?members.find(item=>item.uid===pending.uid):null;

  return <section className="household-panel">
    <div className="section-title"><div><h2>{l('Pessoas','People','Personas')}</h2><span>{members.length} {members.length===1?l('membro','member','miembro'):l('membros','members','miembros')}</span></div></div>
    <div className="member-list">
      {members.map(member=><article className="member-row" key={member.uid}>
        <div className="member-avatar">{(member.displayName||member.email||'?').slice(0,1).toUpperCase()}</div>
        <div className="member-copy">
          <strong>{member.uid===userUid?l('Você','You','Tú'):member.displayName||member.email||l('Membro do Lar','Household member','Miembro del Hogar')}</strong>
          <span>{member.email||l('Conta conectada','Connected account','Cuenta conectada')} · {roleName(member.role)}</span>
        </div>
        <div className="member-access">
          {member.role==='owner'||!canManage
            ? <span className="role-pill">{roleName(member.role)}</span>
            : <select
                value={member.role}
                disabled={workingMember===member.uid}
                onChange={event=>setPending({uid:member.uid,role:event.target.value as Exclude<HouseholdRole,'owner'>})}
                aria-label={l(`Acesso de ${member.displayName||member.email||'membro'}`,`Access for ${member.displayName||member.email||'member'}`,`Acceso de ${member.displayName||member.email||'miembro'}`)}
              >
                <option value="admin">{roleName('admin')}</option>
                <option value="manager">{roleName('manager')}</option>
                <option value="member">{roleName('member')}</option>
                <option value="read_only">{roleName('read_only')}</option>
              </select>}
          {canManage&&member.role!=='owner'&&member.uid!==userUid&&<button
            className="member-remove"
            disabled={workingMember===member.uid}
            onClick={()=>void onRemove(member.uid)}
          >{l('Remover','Remove','Eliminar')}</button>}
        </div>
      </article>)}
    </div>
    {pending&&pendingMember&&<div className="role-confirmation" role="dialog" aria-modal="false" aria-label={l('Confirmar novo acesso','Confirm new access','Confirmar nuevo acceso')}>
      <div><span>{l('ANTES DE CONFIRMAR','BEFORE YOU CONFIRM','ANTES DE CONFIRMAR')}</span><strong>{pendingMember.displayName||pendingMember.email||l('Membro do Lar','Household member','Miembro del Hogar')} → {roleName(pending.role)}</strong></div>
      <p>{householdRoleDescription(pending.role,locale)}</p>
      <small>{pending.role==='read_only'
        ? l('Exemplo: consegue acompanhar saldos e contas compartilhadas, mas não pode marcar pagamento nem editar um Cofrinho.','Example: can follow shared balances and bills, but cannot mark a payment or edit a savings pot.','Ejemplo: puede ver saldos y cuentas compartidas, pero no puede marcar un pago ni editar una alcancía.')
        : pending.role==='member'
          ? l('Exemplo: pode registrar um gasto ou documento do Lar, mas não consegue convidar pessoas nem mudar acessos.','Example: can add a Household expense or document, but cannot invite people or change access.','Ejemplo: puede registrar un gasto o documento del Hogar, pero no puede invitar personas ni cambiar accesos.')
          : pending.role==='manager'
            ? l('Exemplo: pode organizar contas, cartões e conexões financeiras, mas a administração de pessoas continua protegida.','Example: can organize bills, cards, and financial connections, while people administration stays protected.','Ejemplo: puede organizar cuentas, tarjetas y conexiones financieras, pero la administración de personas sigue protegida.')
            : l('Exemplo: pode administrar finanças, configurações e acessos do Lar; o Titular e a exclusão do Lar continuam protegidos.','Example: can manage Household finances, settings, and access; the Owner and Household deletion remain protected.','Ejemplo: puede administrar finanzas, configuración y accesos del Hogar; el Titular y la eliminación del Hogar siguen protegidos.')}</small>
      <div><button type="button" className="ghost-button" onClick={()=>setPending(null)}>{l('Cancelar','Cancel','Cancelar')}</button><button type="button" className="primary-button" disabled={workingMember===pending.uid} onClick={()=>{const next=pending;setPending(null);void onRoleChange(next.uid,next.role);}}>{l('Confirmar acesso','Confirm access','Confirmar acceso')}</button></div>
    </div>}
  </section>;
}
