'use client';

import type { HouseholdRole } from '@/src/core/household';
import { useI18n } from '@/src/i18n/locale-provider';
import type { HouseholdSettingsPayload } from '@/src/lib/repositories/household';
import { householdRoleName } from '@/src/features/household/household-copy';

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
                onChange={event=>void onRoleChange(member.uid,event.target.value as Exclude<HouseholdRole,'owner'>)}
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
  </section>;
}
