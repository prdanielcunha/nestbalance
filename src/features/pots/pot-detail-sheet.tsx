'use client';

import { useState } from 'react';
import type { SavingsPotAutomationKind, SavingsPotAutomationMode, SavingsPotFrequency } from '@/src/core/savings-pot-automation';
import { savingsPotGoalPace } from '@/src/core/savings-pot-goal';
import { SavingsPotCover } from '@/src/features/pots/pot-cover';
import { savingsPotActivityLabel, savingsPotAutomationLabel } from '@/src/features/pots/pot-copy';
import type { HomeSavingsPot } from '@/src/lib/repositories/home';
import type { SavingsPotActivity } from '@/src/lib/repositories/savings-pots';
import { useI18n } from '@/src/i18n/locale-provider';

type MoveMode='reserve'|'withdraw';

export function PotDetailSheet({
  householdId,selected,canContribute,onClose,onEdit,moveWorking,automationWorking,moveMode,moveInput,onMoveInputChange,moveNote,onMoveNoteChange,onStartMove,onCancelMove,onSubmitMove,detailError,automationEditing,onAutomationEditingChange,automationEnabled,onAutomationEnabledChange,automationKind,onAutomationKindChange,automationMode,onAutomationModeChange,automationFrequency,onAutomationFrequencyChange,automationStartDate,onAutomationStartDateChange,automationValue,onAutomationValueChange,onCancelAutomation,onSaveAutomation,activities,detailLoading,onArchive
}:{
  householdId:string;
  selected:HomeSavingsPot;
  canContribute:boolean;
  onClose:()=>void;
  onEdit:()=>void;
  moveWorking:boolean;
  automationWorking:boolean;
  moveMode:MoveMode|null;
  moveInput:string;
  onMoveInputChange:(value:string)=>void;
  moveNote:string;
  onMoveNoteChange:(value:string)=>void;
  onStartMove:(mode:MoveMode,value?:string,note?:string)=>void;
  onCancelMove:()=>void;
  onSubmitMove:()=>void|Promise<void>;
  detailError:string;
  automationEditing:boolean;
  onAutomationEditingChange:(value:boolean)=>void;
  automationEnabled:boolean;
  onAutomationEnabledChange:(value:boolean)=>void;
  automationKind:SavingsPotAutomationKind;
  onAutomationKindChange:(value:SavingsPotAutomationKind)=>void;
  automationMode:SavingsPotAutomationMode;
  onAutomationModeChange:(value:SavingsPotAutomationMode)=>void;
  automationFrequency:SavingsPotFrequency;
  onAutomationFrequencyChange:(value:SavingsPotFrequency)=>void;
  automationStartDate:string;
  onAutomationStartDateChange:(value:string)=>void;
  automationValue:string;
  onAutomationValueChange:(value:string)=>void;
  onCancelAutomation:()=>void;
  onSaveAutomation:()=>void|Promise<void>;
  activities:SavingsPotActivity[];
  detailLoading:boolean;
  onArchive:()=>void|Promise<void>;
}){
  const {locale,intlLocale,formatMoney,formatDate}=useI18n();
  const [confirmAutomation,setConfirmAutomation]=useState(false);
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const pace=savingsPotGoalPace(selected.balanceMinor,selected.goalMinor,selected.targetDate);
  const formatInput=(minor:number)=>(minor/100).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
  return <div className="sheet-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&!moveWorking&&!automationWorking&&onClose()}>
    <section className="capture-sheet pot-detail-sheet" role="dialog" aria-modal="true" aria-label={selected.name}>
      <div className="sheet-handle"/>
      <SavingsPotCover householdId={householdId} potId={selected.id} name={selected.name} hasCover={selected.hasCover} coverVersion={selected.coverVersion} className="savings-pot-cover-detail"/>
      <div className="pot-detail-heading"><div><span>{selected.institutionName||l('Criado no NestBalance','Created in NestBalance','Creado en NestBalance')}</span><h2>{selected.name}</h2></div>{canContribute&&<button className="ghost-button" type="button" onClick={onEdit}>{l('Editar','Edit','Editar')}</button>}</div>
      <div className="pot-detail-balance">
        <span>{l('Guardado agora','Saved now','Guardado ahora')}</span><strong>{formatMoney(selected.balanceMinor)}</strong>
        {selected.goalMinor&&selected.goalMinor>0&&<><div><span>{l('Meta','Goal','Meta')} {formatMoney(selected.goalMinor)}</span><b>{Math.round(Math.min(1,selected.balanceMinor/selected.goalMinor)*100)}%</b></div><progress max={selected.goalMinor} value={Math.min(selected.balanceMinor,selected.goalMinor)}/></>}
      </div>
      {selected.goalMinor&&<div className="pot-goal-insight">
        {pace.reached
          ? <><strong>{l('Meta alcançada','Goal reached','Meta alcanzada')}</strong><span>{l('Você chegou ao valor que definiu. Pode continuar guardando ou usar o dinheiro quando chegar a hora.','You reached the amount you set. You can keep saving or use the money when the time comes.','Llegaste al valor definido. Puedes seguir ahorrando o usar el dinero cuando llegue el momento.')}</span></>
          : pace.overdue
            ? <><strong>{l('O prazo passou','The deadline passed','El plazo pasó')}</strong><span>{l(`Ainda faltam ${formatMoney(pace.remainingMinor)}. Você pode ajustar a data sem perder o histórico.`,`${formatMoney(pace.remainingMinor)} is still needed. You can adjust the date without losing history.`,`Aún faltan ${formatMoney(pace.remainingMinor)}. Puedes ajustar la fecha sin perder el historial.`)}</span></>
            : <><strong>{l(`Faltam ${formatMoney(pace.remainingMinor)}`,`${formatMoney(pace.remainingMinor)} left`,`Faltan ${formatMoney(pace.remainingMinor)}`)}</strong><span>{selected.targetDate&&pace.suggestedMonthlyMinor
                ? l(`Para chegar até ${formatDate(new Date(selected.targetDate+'T12:00:00'),{day:'2-digit',month:'long',year:'numeric'})}, a referência é cerca de ${formatMoney(pace.suggestedMonthlyMinor)} por mês ou ${formatMoney(pace.suggestedWeeklyMinor||0)} por semana.`,`To get there by ${formatDate(new Date(selected.targetDate+'T12:00:00'),{day:'2-digit',month:'long',year:'numeric'})}, a useful reference is about ${formatMoney(pace.suggestedMonthlyMinor)} per month or ${formatMoney(pace.suggestedWeeklyMinor||0)} per week.`,`Para llegar hasta ${formatDate(new Date(selected.targetDate+'T12:00:00'),{day:'2-digit',month:'long',year:'numeric'})}, una referencia útil es cerca de ${formatMoney(pace.suggestedMonthlyMinor)} por mes o ${formatMoney(pace.suggestedWeeklyMinor||0)} por semana.`)
                : l('Defina um prazo se quiser que o NestBalance calcule um ritmo sugerido.','Set a deadline if you want NestBalance to calculate a suggested pace.','Define un plazo si quieres que NestBalance calcule un ritmo sugerido.')}</span></>}
        {!pace.reached&&pace.suggestedMonthlyMinor&&canContribute&&<button type="button" className="pot-goal-quick-action" onClick={()=>onStartMove('reserve',formatInput(pace.suggestedMonthlyMinor||0),l('Valor sugerido para a meta','Suggested goal amount','Valor sugerido para la meta'))}>{l(`Reservar ${formatMoney(pace.suggestedMonthlyMinor)} agora`,`Save ${formatMoney(pace.suggestedMonthlyMinor)} now`,`Reservar ${formatMoney(pace.suggestedMonthlyMinor)} ahora`)}</button>}
      </div>}
      {selected.note&&<p className="pot-detail-note">{selected.note}</p>}
      {canContribute&&<div className="pot-money-actions"><button type="button" onClick={()=>onStartMove('reserve')}>{l('Reservar','Save','Reservar')}</button><button type="button" className="secondary" disabled={selected.balanceMinor<=0} onClick={()=>onStartMove('withdraw')}>{l('Retirar','Withdraw','Retirar')}</button></div>}
      {moveMode&&<div className="pot-inline-panel">
        <div><span className="section-kicker">{moveMode==='reserve'?l('RESERVAR','SAVE','RESERVAR'):l('RETIRAR','WITHDRAW','RETIRAR')}</span><h3>{moveMode==='reserve'?l('Quanto você separou?','How much did you set aside?','¿Cuánto separaste?'):l('Quanto você tirou?','How much did you take out?','¿Cuánto retiraste?')}</h3></div>
        <div className="money-input-wrap"><span>R$</span><input autoFocus inputMode="decimal" value={moveInput} onChange={event=>onMoveInputChange(event.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
        <input className="pot-text-input" value={moveNote} onChange={event=>onMoveNoteChange(event.target.value)} placeholder={l('Observação opcional','Optional note','Nota opcional')} maxLength={160}/>
        <small>{l('Isso atualiza sua organização no NestBalance; não envia ordem para o banco.','This updates your NestBalance organization; it does not send an order to your bank.','Esto actualiza tu organización en NestBalance; no envía una orden al banco.')}</small>
        <div className="sheet-actions"><button className="ghost-button" disabled={moveWorking} onClick={onCancelMove}>{l('Cancelar','Cancel','Cancelar')}</button><button className="primary-button" disabled={moveWorking} onClick={()=>void onSubmitMove()}>{moveWorking?l('Guardando…','Saving…','Guardando…'):moveMode==='reserve'?l('Confirmar reserva','Confirm saving','Confirmar reserva'):l('Confirmar retirada','Confirm withdrawal','Confirmar retiro')}</button></div>
      </div>}
      <section className="pot-automation-section">
        <div className="section-title"><div><span className="section-kicker">{l('AUTOMAÇÃO','AUTOMATION','AUTOMATIZACIÓN')}</span><h3>{l('Guardar sem depender da memória','Save without relying on memory','Ahorrar sin depender de la memoria')}</h3></div>{selected.source!=='screen_import'&&canContribute&&<button type="button" className="section-action" onClick={()=>onAutomationEditingChange(!automationEditing)}>{automationEditing?l('Fechar','Close','Cerrar'):l('Configurar','Set up','Configurar')}</button>}</div>
        {selected.source==='screen_import'
          ? <div className="pot-automation-explainer"><strong>{l('Este cofrinho veio de um banco.','This savings pot came from a bank.','Esta alcancía vino de un banco.')}</strong><span>{l('Para o saldo continuar fiel ao banco, não criamos reservas automáticas aqui. Quando mudar, mande outro print e atualizamos sem duplicar.','To keep the balance faithful to the bank, we do not create automatic savings here. When it changes, send another screenshot and we update it without duplicates.','Para que el saldo siga fiel al banco, no creamos ahorros automáticos aquí. Cuando cambie, envía otra captura y lo actualizamos sin duplicar.')}</span></div>
          : <>
              {!automationEditing&&<div className={selected.automation?.enabled?'pot-automation-summary active':'pot-automation-summary'}><strong>{selected.automation?.enabled?savingsPotAutomationLabel(selected.automation,locale):l('Automação desligada','Automation off','Automatización desactivada')}</strong><span>{selected.automation?.enabled?l('O NestBalance registra essas reservas automaticamente quando os gatilhos aparecem nos seus dados.','NestBalance records these savings automatically when the triggers appear in your data.','NestBalance registra estos ahorros automáticamente cuando los disparadores aparecen en tus datos.'):l('Você decide se quer reservar por frequência, quando gastar ou quando receber.','You decide whether to save by schedule, when you spend, or when money comes in.','Tú decides si quieres ahorrar por frecuencia, al gastar o al recibir.')}</span></div>}
              {automationEditing&&<div className="pot-automation-editor">
                <label className="pot-toggle-row"><input type="checkbox" checked={automationEnabled} onChange={event=>onAutomationEnabledChange(event.target.checked)}/><span><strong>{l('Ativar reserva automática','Enable automatic saving','Activar ahorro automático')}</strong><small>{l('Só organiza dentro do NestBalance; não movimenta seu banco.','Only organizes inside NestBalance; it does not move money at your bank.','Solo organiza dentro de NestBalance; no mueve dinero en tu banco.')}</small></span></label>
                {automationEnabled&&<>
                  <div className="pot-automation-kind-grid">{([
                    ['frequency',l('Por frequência','By schedule','Por frecuencia'),l('Todo dia, semana, 15 dias ou mês','Daily, weekly, every 15 days, or monthly','Cada día, semana, 15 días o mes')],
                    ['spend',l('Quando eu gastar','When I spend','Cuando gaste'),l('A cada gasto conhecido','For each known expense','Por cada gasto conocido')],
                    ['income',l('Quando eu receber','When I receive','Cuando reciba'),l('A cada entrada conhecida','For each known income','Por cada ingreso conocido')],
                    ['roundup',l('Arredondar gastos','Round up spending','Redondear gastos'),l('Guarda os centavos até o próximo real','Saves the cents up to the next whole real','Guarda los centavos hasta el próximo real')]
                  ] as const).map(([kind,title,hint])=><button type="button" key={kind} className={automationKind===kind?'active':''} onClick={()=>onAutomationKindChange(kind)}><strong>{title}</strong><span>{hint}</span></button>)}</div>
                  {automationKind==='frequency'
                    ? <><label><span className="field-label">{l('Frequência','Frequency','Frecuencia')}</span><select className="pot-text-input" value={automationFrequency} onChange={event=>onAutomationFrequencyChange(event.target.value as SavingsPotFrequency)}><option value="daily">{l('Todo dia','Every day','Cada día')}</option><option value="weekly">{l('Toda semana','Every week','Cada semana')}</option><option value="biweekly">{l('A cada 15 dias','Every 15 days','Cada 15 días')}</option><option value="monthly">{l('Todo mês','Every month','Cada mes')}</option></select></label><label><span className="field-label">{l('Primeira reserva (opcional)','First saving date (optional)','Primera reserva (opcional)')}</span><input className="pot-text-input" type="date" value={automationStartDate} onChange={event=>onAutomationStartDateChange(event.target.value)}/></label><label><span className="field-label">{l('Quanto reservar','Amount to save','Cuánto reservar')}</span><div className="money-input-wrap"><span>R$</span><input inputMode="decimal" value={automationValue} onChange={event=>onAutomationValueChange(event.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div></label></>
                    : automationKind==='roundup'
                      ? <div className="pot-automation-explainer"><strong>{l('Os centavos viram progresso.','Your cents become progress.','Tus centavos se convierten en progreso.')}</strong><span>{l('Exemplo: ao registrar um gasto de R$ 12,37, o NestBalance acrescenta R$ 0,63 ao acompanhamento deste cofrinho. Nada é debitado do banco.','Example: when you record a R$ 12.37 expense, NestBalance adds R$ 0.63 to this savings pot tracking. Nothing is debited from your bank.','Ejemplo: al registrar un gasto de R$ 12,37, NestBalance agrega R$ 0,63 al seguimiento de esta alcancía. No se debita nada del banco.')}</span></div>
                      : <><div className="pot-mode-tabs"><button type="button" className={automationMode==='fixed'?'active':''} onClick={()=>onAutomationModeChange('fixed')}>{l('Valor fixo','Fixed amount','Valor fijo')}</button><button type="button" className={automationMode==='percent'?'active':''} onClick={()=>onAutomationModeChange('percent')}>{l('Percentual','Percentage','Porcentaje')}</button></div><label><span className="field-label">{automationMode==='fixed'?l('Quanto reservar','Amount to save','Cuánto reservar'):l('Percentual','Percentage','Porcentaje')}</span>{automationMode==='fixed'?<div className="money-input-wrap"><span>R$</span><input inputMode="decimal" value={automationValue} onChange={event=>onAutomationValueChange(event.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>:<div className="pot-percent-input"><input inputMode="decimal" value={automationValue} onChange={event=>onAutomationValueChange(event.target.value)} placeholder="5"/><span>%</span></div>}</label></>}
                </>}
                {confirmAutomation&&<div className="pot-automation-confirm" role="alertdialog" aria-label={l('Confirmar automação','Confirm automation','Confirmar automatización')}>
                  <strong>{automationEnabled?l('Ativar esta regra?','Enable this rule?','¿Activar esta regla?'):l('Desativar esta regra?','Disable this rule?','¿Desactivar esta regla?')}</strong>
                  <span>{automationEnabled?savingsPotAutomationLabel({enabled:true,kind:automationKind,mode:automationKind==='roundup'?'fixed':automationMode,amountMinor:null,percentBps:null,frequency:automationKind==='frequency'?automationFrequency:null,anchorDate:automationStartDate||null},locale):l('A automação deixará de criar reservas organizacionais.','The automation will stop creating organizational savings.','La automatización dejará de crear ahorros organizacionales.')}</span>
                  <small>{l('Confirme sabendo que isso só registra organização dentro do NestBalance. Nenhuma ordem ou movimentação será enviada ao banco.','Confirm knowing this only records organization inside NestBalance. No order or money movement will be sent to your bank.','Confirma sabiendo que esto solo registra organización dentro de NestBalance. No se enviará ninguna orden ni movimiento al banco.')}</small>
                  <div><button className="ghost-button" type="button" disabled={automationWorking} onClick={()=>setConfirmAutomation(false)}>{l('Voltar','Back','Volver')}</button><button className="primary-button" type="button" disabled={automationWorking} onClick={()=>{setConfirmAutomation(false);void onSaveAutomation();}}>{automationWorking?l('Guardando…','Saving…','Guardando…'):l('Confirmar regra','Confirm rule','Confirmar regla')}</button></div>
                </div>}
                {!confirmAutomation&&<div className="sheet-actions"><button className="ghost-button" disabled={automationWorking} onClick={()=>{setConfirmAutomation(false);onCancelAutomation();}}>{l('Cancelar','Cancel','Cancelar')}</button><button className="primary-button" disabled={automationWorking} onClick={()=>setConfirmAutomation(true)}>{l('Revisar e salvar','Review and save','Revisar y guardar')}</button></div>}
              </div>}
            </>}
      </section>
      <section className="pot-history-section">
        <div className="section-title"><div><span className="section-kicker">{l('HISTÓRICO','HISTORY','HISTORIAL')}</span><h3>{l('Tudo que mudou neste cofrinho','Everything that changed here','Todo lo que cambió aquí')}</h3></div></div>
        {detailLoading
          ? <div className="pot-history-list">{[0,1,2].map(i=><div className="pot-history-row skeleton-line" key={i}/>)}</div>
          : activities.length===0
            ? <p className="pot-history-empty">{l('O histórico começa na próxima alteração de saldo.','History starts with the next balance change.','El historial comienza con el próximo cambio de saldo.')}</p>
            : <div className="pot-history-list">{activities.slice(0,12).map(activity=><div className="pot-history-row" key={activity.id}><div><strong>{savingsPotActivityLabel(activity,locale)}</strong><span>{activity.createdAtMs?formatDate(new Date(activity.createdAtMs),{day:'2-digit',month:'short',year:'numeric'}):''}{activity.note?' · '+activity.note:''}</span></div><div><b>{activity.type==='withdraw'?'−':'+'} {formatMoney(activity.amountMinor)}</b><small>{l('saldo','balance','saldo')} {formatMoney(activity.resultingBalanceMinor)}</small></div></div>)}</div>}
      </section>
      {detailError&&<p className="error-copy" role="alert">{detailError}</p>}
      <div className="pot-detail-footer">{canContribute&&selected.balanceMinor===0&&<button className="text-button danger-text" disabled={moveWorking} onClick={()=>void onArchive()}>{l('Finalizar este cofrinho','Finish this savings pot','Finalizar esta alcancía')}</button>}<button className="ghost-button" disabled={moveWorking||automationWorking} onClick={onClose}>{l('Fechar','Close','Cerrar')}</button></div>
    </section>
  </div>;
}
