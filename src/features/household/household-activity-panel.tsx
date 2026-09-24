'use client';

import { useI18n } from '@/src/i18n/locale-provider';
import type { HouseholdSettingsPayload } from '@/src/lib/repositories/household';
import { householdActivityText } from '@/src/features/household/household-copy';

export function HouseholdActivityPanel({
  activity,
  personName
}:{
  activity:HouseholdSettingsPayload['activity'];
  personName:(uid:string|null)=>string;
}){
  const {t,locale,formatDate}=useI18n();
  return <section className="household-panel household-activity-panel">
    <div className="section-title"><div><h2>{t.recentActivity}</h2><span>{t.recentActivityHint}</span></div></div>
    {activity.length===0
      ? <p className="household-helper">{t.noRecentActivity}</p>
      : <div className="household-activity-list">
          {activity.map(item=>{
            const actor=personName(item.actorUid);
            return <article className="household-activity-row" key={item.id}>
              <div className="member-avatar">{actor.slice(0,1).toUpperCase()}</div>
              <div>
                <p><strong>{actor}</strong> {householdActivityText(item.type,personName(item.targetUid),item.scope,locale)}</p>
                <span>{item.createdAtMs?formatDate(item.createdAtMs,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''}{item.scope==='personal'?(locale==='en'?' · private':locale==='es'?' · privado':' · pessoal'):''}</span>
              </div>
            </article>;
          })}
        </div>}
  </section>;
}
