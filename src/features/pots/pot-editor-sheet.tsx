'use client';

import type { FinancialScope } from '@/src/core/privacy';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import { SavingsPotCover } from '@/src/features/pots/pot-cover';
import type { HomeSavingsPot } from '@/src/lib/repositories/home';
import { useI18n } from '@/src/i18n/locale-provider';

export function PotEditorSheet({
  householdId,creating,editing,onClose,scope,onScopeChange,saving,coverPreview,removeCover,onChooseCover,onRemoveCover,name,onNameChange,balanceInput,onBalanceChange,goalInput,onGoalChange,targetDate,onTargetDateChange,institution,onInstitutionChange,note,onNoteChange,formError,onSave
}:{
  householdId:string;
  creating:boolean;
  editing:HomeSavingsPot|null;
  onClose:()=>void;
  scope:FinancialScope;
  onScopeChange:(scope:FinancialScope)=>void;
  saving:boolean;
  coverPreview:string|null;
  removeCover:boolean;
  onChooseCover:(file:File|null)=>void;
  onRemoveCover:()=>void;
  name:string;
  onNameChange:(value:string)=>void;
  balanceInput:string;
  onBalanceChange:(value:string)=>void;
  goalInput:string;
  onGoalChange:(value:string)=>void;
  targetDate:string;
  onTargetDateChange:(value:string)=>void;
  institution:string;
  onInstitutionChange:(value:string)=>void;
  note:string;
  onNoteChange:(value:string)=>void;
  formError:string;
  onSave:()=>void|Promise<void>;
}){
  const {locale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  if(!creating&&!editing) return null;
  return <div className="sheet-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&onClose()}>
    <section className="capture-sheet pot-editor-sheet" role="dialog" aria-modal="true" aria-label={creating?l('Criar cofrinho','Create savings pot','Crear alcancía'):l('Editar cofrinho','Edit savings pot','Editar alcancía')}>
      <div className="sheet-handle"/>
      <div className="eyebrow">{creating?l('NOVO OBJETIVO','NEW GOAL','NUEVO OBJETIVO'):l('DETALHES DO COFRINHO','SAVINGS POT DETAILS','DETALLES DE LA ALCANCÍA')}</div>
      <h2>{creating?l('Dê um rosto para essa meta.','Give this goal a face.','Dale una cara a esta meta.'):editing?.name}</h2>
      <p>{l('Nome, foto, meta e prazo ajudam a transformar “guardar dinheiro” em algo concreto.','Name, photo, goal, and deadline turn “saving money” into something concrete.','Nombre, foto, meta y plazo convierten “ahorrar dinero” en algo concreto.')}</p>
      {creating&&<ScopeChoice value={scope} onChange={onScopeChange} disabled={saving}/>}
      <div className="pot-cover-editor">
        {coverPreview
          ? <img src={coverPreview} alt={l('Prévia da foto do cofrinho','Savings pot photo preview','Vista previa de la foto de la alcancía')}/>
          : editing?.hasCover&&!removeCover
            ? <SavingsPotCover householdId={householdId} potId={editing.id} name={editing.name} hasCover coverVersion={editing.coverVersion}/>
            : <div className="pot-cover-placeholder"><span>{l('Sem foto','No photo','Sin foto')}</span></div>}
        <div>
          <label className="ghost-button pot-photo-button">
            {editing?.hasCover&&!removeCover?l('Trocar foto','Change photo','Cambiar foto'):l('Escolher foto','Choose photo','Elegir foto')}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>onChooseCover(event.target.files?.[0]||null)} disabled={saving}/>
          </label>
          {(coverPreview||(editing?.hasCover&&!removeCover))&&<button type="button" className="text-button" disabled={saving} onClick={onRemoveCover}>{l('Remover foto','Remove photo','Quitar foto')}</button>}
          <small>{l('JPG, PNG ou WebP · até 5 MB.','JPG, PNG, or WebP · up to 5 MB.','JPG, PNG o WebP · hasta 5 MB.')}</small>
        </div>
      </div>
      <div className="pot-editor-grid">
        <label><span className="field-label">{l('Nome','Name','Nombre')}</span><input className="pot-text-input" value={name} onChange={event=>onNameChange(event.target.value)} placeholder={l('Ex.: Aniversário Davi','E.g. Davi birthday','Ej.: Cumpleaños Davi')} maxLength={80}/></label>
        {creating&&<label><span className="field-label">{l('Quanto já tem','Already saved','Cuánto ya tienes')}</span><div className="money-input-wrap"><span>R$</span><input inputMode="decimal" value={balanceInput} onChange={event=>onBalanceChange(event.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div></label>}
        <label><span className="field-label">{l('Meta (opcional)','Goal (optional)','Meta (opcional)')}</span><div className="money-input-wrap"><span>R$</span><input inputMode="decimal" value={goalInput} onChange={event=>onGoalChange(event.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div></label>
        <label><span className="field-label">{l('Quero chegar lá até (opcional)','Target date (optional)','Quiero llegar hasta (opcional)')}</span><input className="pot-text-input" type="date" value={targetDate} onChange={event=>onTargetDateChange(event.target.value)}/></label>
        <label className="pot-editor-wide"><span className="field-label">{l('Onde esse dinheiro está (opcional)','Where this money is (optional)','Dónde está este dinero (opcional)')}</span><input className="pot-text-input" value={institution} onChange={event=>onInstitutionChange(event.target.value)} placeholder={l('Ex.: Mercado Pago, Nubank, dinheiro em casa…','E.g. Mercado Pago, Nubank, cash at home…','Ej.: Mercado Pago, Nubank, efectivo en casa…')} maxLength={80}/></label>
        <label className="pot-editor-wide"><span className="field-label">{l('Uma frase para lembrar o porquê (opcional)','A note to remember why (optional)','Una frase para recordar por qué (opcional)')}</span><textarea className="pot-note-input" value={note} onChange={event=>onNoteChange(event.target.value)} placeholder={l('Ex.: Festa de 2 anos do Davi','E.g. Davi’s 2nd birthday','Ej.: Fiesta de 2 años de Davi')} maxLength={280} rows={3}/></label>
      </div>
      {editing&&<div className="pot-balance-edit-hint"><strong>{l('Saldo atual','Current balance','Saldo actual')} · {formatMoney(editing.balanceMinor)}</strong><span>{l('Para mudar o saldo, abra o cofrinho e use Reservar ou Retirar. Assim o histórico fica correto.','To change the balance, open the savings pot and use Save or Withdraw so the history stays accurate.','Para cambiar el saldo, abre la alcancía y usa Reservar o Retirar para mantener el historial correcto.')}</span></div>}
      {formError&&<p className="error-copy" role="alert">{formError}</p>}
      <div className="sheet-actions"><button className="ghost-button" disabled={saving} onClick={onClose}>{l('Cancelar','Cancel','Cancelar')}</button><button className="primary-button" disabled={saving} onClick={()=>void onSave()}>{saving?l('Guardando…','Saving…','Guardando…'):l('Guardar cofrinho','Save savings pot','Guardar alcancía')}</button></div>
    </section>
  </div>;
}
