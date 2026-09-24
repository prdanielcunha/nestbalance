'use client';

import { useState } from 'react';
import type { IntelligencePreferences } from '@/src/core/intelligence-preferences';
import { saveIntelligencePreferences } from '@/src/lib/repositories/planning';
import { useI18n } from '@/src/i18n/locale-provider';

type TopicKey=keyof Pick<IntelligencePreferences,'duplicates'|'amountIncreases'|'spendingChanges'|'subscriptions'|'dueBills'|'potSuggestions'>;
type ChannelKey=keyof IntelligencePreferences['channels'];

export function IntelligencePreferencesPanel({
  householdId,
  preferences,
  onChange,
  onError
}:{
  householdId:string;
  preferences:IntelligencePreferences;
  onChange:(next:IntelligencePreferences)=>void;
  onError:(message:string)=>void;
}){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [saving,setSaving]=useState(false);

  async function persist(next:IntelligencePreferences){
    if(saving) return;
    const previous=preferences;
    onChange(next);
    setSaving(true);
    onError('');
    try{
      const result=await saveIntelligencePreferences(householdId,next);
      onChange(result.preferences);
    }catch{
      onChange(previous);
      onError(l('Não conseguimos salvar essa preferência.','We could not save that preference.','No pudimos guardar esa preferencia.'));
    }finally{
      setSaving(false);
    }
  }

  const topics:Array<[TopicKey,string]>=[
    ['duplicates',l('Duplicidades','Duplicates','Duplicados')],
    ['amountIncreases',l('Reajustes e aumentos','Increases','Aumentos')],
    ['spendingChanges',l('Mudanças no mês','Monthly changes','Cambios del mes')],
    ['subscriptions',l('Assinaturas','Subscriptions','Suscripciones')],
    ['dueBills',l('Vencimentos','Due dates','Vencimientos')],
    ['potSuggestions',l('Sugestões de Cofrinho','Savings-pot suggestions','Sugerencias de alcancía')]
  ];
  const channels:Array<[ChannelKey,string,string]>=[
    ['inApp',l('Dentro do app','In the app','Dentro de la app'),l('Mostra os insights no Radar explicável.','Shows insights in the Explainable radar.','Muestra los insights en el Radar explicable.')],
    ['device',l('No aparelho','On device','En el dispositivo'),l('Guarda sua preferência para push quando esse canal estiver habilitado. Não envia nada hoje.','Saves your preference for push when that channel is enabled. Nothing is sent today.','Guarda tu preferencia para push cuando ese canal esté habilitado. No envía nada hoy.')]
  ];

  return <section className="planning-panel preference-panel">
    <div className="section-title"><div><h3>{l('Preferências de inteligência','Intelligence preferences','Preferencias de inteligencia')}</h3><span>{l('assunto, urgência e canal','topic, urgency and channel','tema, urgencia y canal')}</span></div></div>
    <div className="intelligence-options">
      {topics.map(([key,label])=><button type="button" key={key} aria-pressed={preferences[key]} disabled={saving} className={preferences[key]?'active':''} onClick={()=>void persist({...preferences,[key]:!preferences[key]})}><span>{label}</span><b>{preferences[key]?l('Ativo','On','Activo'):l('Silenciado','Muted','Silenciado')}</b></button>)}
    </div>
    <label className="preference-select"><span>{l('Mostrar a partir de','Show starting at','Mostrar desde')}</span><select value={preferences.minimumUrgency} disabled={saving} onChange={event=>void persist({...preferences,minimumUrgency:event.target.value as IntelligencePreferences['minimumUrgency']})}><option value="critical">{l('Só crítico','Critical only','Solo crítico')}</option><option value="high">{l('Alta prioridade','High priority','Alta prioridad')}</option><option value="normal">{l('Normal','Normal','Normal')}</option><option value="low">{l('Tudo, inclusive baixa prioridade','Everything, including low priority','Todo, incluso baja prioridad')}</option></select></label>
    <div className="intelligence-channels" aria-label={l('Canais dos insights','Insight channels','Canales de insights')}>
      <span>{l('Canais','Channels','Canales')}</span>
      {channels.map(([key,label,help])=><button type="button" key={key} aria-pressed={preferences.channels[key]} disabled={saving} className={preferences.channels[key]?'active':''} onClick={()=>void persist({...preferences,channels:{...preferences.channels,[key]:!preferences.channels[key]}})}>
        <span><strong>{label}</strong><small>{help}</small></span>
        <b>{preferences.channels[key]?l('Ativo','On','Activo'):l('Desligado','Off','Desactivado')}</b>
      </button>)}
    </div>
    {!preferences.channels.inApp&&<p className="planning-disclaimer">{l('O Radar fica oculto porque o canal “Dentro do app” está desligado. Os cálculos continuam locais e podem ser reativados quando você quiser.','The Radar is hidden because “In the app” is off. Calculations remain local and can be enabled again anytime.','El Radar queda oculto porque “Dentro de la app” está desactivado. Los cálculos siguen locales y puedes reactivarlo cuando quieras.')}</p>}
  </section>;
}
