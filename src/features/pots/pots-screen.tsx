'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { HouseholdRole } from '@/src/core/household';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { cleanSavingsPotDisplayName, groupSavingsPots } from '@/src/core/savings-pots';
import type { SavingsPotAutomation, SavingsPotAutomationKind, SavingsPotAutomationMode, SavingsPotFrequency } from '@/src/core/savings-pot-automation';
import type { FinancialScope } from '@/src/core/privacy';
import { loadHomeData, type HomeSavingsPot } from '@/src/lib/repositories/home';
import {
  archiveSavingsPot,
  deleteSavingsPotCover,
  getSavingsPotDetail,
  moveSavingsPot,
  syncSavingsPotAutomations,
  updateSavingsPotAutomation,
  uploadSavingsPotCover,
  upsertSavingsPot
} from '@/src/lib/repositories/savings-pots';
import { inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { AppShell } from '@/src/features/navigation/app-shell';
import { useI18n } from '@/src/i18n/locale-provider';
import { useHouseholdRevisionRefresh } from '@/src/features/realtime/use-household-revision';
import { PotsOverview } from '@/src/features/pots/pots-overview';
import { PotEditorSheet } from '@/src/features/pots/pot-editor-sheet';
import { PotDetailSheet } from '@/src/features/pots/pot-detail-sheet';
type MoveMode='reserve'|'withdraw';
function todayKey(){
  return new Date().toISOString().slice(0,10);
}
export function PotsScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {locale,intlLocale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const canContribute=role!=='read_only';
  const [pots,setPots]=useState<HomeSavingsPot[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [view,setView]=useState<FinancialView>('household');
  const [editing,setEditing]=useState<HomeSavingsPot|null>(null);
  const [creating,setCreating]=useState(false);
  const [name,setName]=useState('');
  const [balanceInput,setBalanceInput]=useState('');
  const [goalInput,setGoalInput]=useState('');
  const [targetDate,setTargetDate]=useState('');
  const [note,setNote]=useState('');
  const [institution,setInstitution]=useState('');
  const [scope,setScope]=useState<FinancialScope>('household');
  const [coverFile,setCoverFile]=useState<File|null>(null);
  const [coverPreview,setCoverPreview]=useState<string|null>(null);
  const [removeCover,setRemoveCover]=useState(false);
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState('');
  const [selected,setSelected]=useState<HomeSavingsPot|null>(null);
  const [activities,setActivities]=useState<SavingsPotActivity[]>([]);
  const [detailLoading,setDetailLoading]=useState(false);
  const [moveMode,setMoveMode]=useState<MoveMode|null>(null);
  const [moveInput,setMoveInput]=useState('');
  const [moveNote,setMoveNote]=useState('');
  const [moveWorking,setMoveWorking]=useState(false);
  const [detailError,setDetailError]=useState('');
  const [automationEditing,setAutomationEditing]=useState(false);
  const [automationEnabled,setAutomationEnabled]=useState(false);
  const [automationKind,setAutomationKind]=useState<SavingsPotAutomationKind>('frequency');
  const [automationMode,setAutomationMode]=useState<SavingsPotAutomationMode>('fixed');
  const [automationFrequency,setAutomationFrequency]=useState<SavingsPotFrequency>('monthly');
  const [automationStartDate,setAutomationStartDate]=useState('');
  const [automationValue,setAutomationValue]=useState('');
  const [automationWorking,setAutomationWorking]=useState(false);
  async function load(silent=false){
    if(!silent) setLoading(true);
    setError('');
    try{
      if(canContribute){
        await syncSavingsPotAutomations(householdId).catch(()=>undefined);
      }
      const data=await loadHomeData(householdId);
      const cleaned=(data.savingsPots||[]).map(item=>({...item,name:cleanSavingsPotDisplayName(item.name)||item.name}));
      setPots(cleaned);
      if(selected){
        const fresh=cleaned.find(item=>item.id===selected.id)||null;
        setSelected(fresh);
      }
    }catch{
      setError(l('Não conseguimos carregar seus cofrinhos agora.','We could not load your savings pots right now.','No pudimos cargar tus alcancías ahora.'));
    }finally{
      if(!silent) setLoading(false);
    }
  }
  useHouseholdRevisionRefresh(householdId,()=>load(true),25_000,['pots']);
  useEffect(()=>{
    void load();
    const onFocus=()=>void load(true);
    const onVisibility=()=>{if(document.visibilityState==='visible') void load(true);};
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    return ()=>{window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);};
  },[householdId]);
  useEffect(()=>()=>{if(coverPreview)URL.revokeObjectURL(coverPreview);},[coverPreview]);
  const visible=useMemo(()=>pots.filter(item=>inFinancialView(item.scope,view)),[pots,view]);
  const groups=useMemo(()=>groupSavingsPots(visible),[visible]);
  const total=useMemo(()=>groups.reduce((sum,item)=>sum+item.balanceMinor,0),[groups]);
  const goalsTotal=useMemo(()=>groups.filter(item=>item.goalMinor&&item.goalMinor>0).reduce((sum,item)=>sum+(item.goalMinor||0),0),[groups]);
  const remainingTotal=useMemo(()=>groups.reduce((sum,item)=>sum+Math.max(0,(item.goalMinor||0)-item.balanceMinor),0),[groups]);
  const reachedCount=useMemo(()=>groups.filter(item=>item.goalMinor&&item.balanceMinor>=item.goalMinor).length,[groups]);
  const institutionCount=useMemo(()=>new Set(visible.map(item=>item.institutionName||l('NestBalance','NestBalance','NestBalance'))).size,[visible,locale]);
  function formatInput(value:number){
    return (value/100).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
  }
  function resetEditorState(){
    setEditing(null);
    setCreating(false);
    setName('');
    setBalanceInput('');
    setGoalInput('');
    setTargetDate('');
    setNote('');
    setInstitution('');
    setScope('household');
    setCoverFile(null);
    setRemoveCover(false);
    setFormError('');
    setCoverPreview(current=>{if(current)URL.revokeObjectURL(current);return null;});
  }
  function closeEditor(){
    if(saving) return;
    resetEditorState();
  }
  function openNew(){
    resetEditorState();
    setCreating(true);
    setScope(view==='personal'?'personal':'household');
  }
  function openEdit(item:HomeSavingsPot){
    resetEditorState();
    setEditing(item);
    setName(cleanSavingsPotDisplayName(item.name));
    setBalanceInput(formatInput(item.balanceMinor));
    setGoalInput(item.goalMinor&&item.goalMinor>0?formatInput(item.goalMinor):'');
    setTargetDate(item.targetDate||'');
    setNote(item.note||'');
    setInstitution(item.institutionName||'');
    setScope(item.scope==='personal'?'personal':'household');
  }
  function chooseCover(file:File|null){
    setFormError('');
    if(!file){
      setCoverFile(null);
      setCoverPreview(current=>{if(current)URL.revokeObjectURL(current);return null;});
      return;
    }
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      setFormError(l('Escolha uma foto JPG, PNG ou WebP.','Choose a JPG, PNG, or WebP image.','Elige una imagen JPG, PNG o WebP.'));
      return;
    }
    if(file.size>5*1024*1024){
      setFormError(l('A foto pode ter até 5 MB.','The photo can be up to 5 MB.','La foto puede tener hasta 5 MB.'));
      return;
    }
    setCoverFile(file);
    setRemoveCover(false);
    setCoverPreview(current=>{if(current)URL.revokeObjectURL(current);return URL.createObjectURL(file);});
  }
  async function save(){
    if(saving) return;
    const cleanName=name.trim();
    if(cleanName.length<2){
      setFormError(l('Dê um nome para este cofrinho.','Give this savings pot a name.','Ponle un nombre a esta alcancía.'));
      return;
    }
    const balanceMinor=editing?.balanceMinor??parseMoneyInputToMinor(balanceInput||'0',locale);
    if(balanceMinor===null||balanceMinor<0){
      setFormError(l('Digite um valor guardado válido.','Enter a valid saved amount.','Escribe un valor guardado válido.'));
      return;
    }
    const goalMinor=goalInput.trim()?parseMoneyInputToMinor(goalInput,locale):null;
    if(goalInput.trim()&&(goalMinor===null||goalMinor<=0)){
      setFormError(l('Digite uma meta válida ou deixe em branco.','Enter a valid goal or leave it blank.','Escribe una meta válida o déjala en blanco.'));
      return;
    }
    setSaving(true);
    setFormError('');
    setNotice('');
    try{
      const result=await upsertSavingsPot({
        householdId,
        potId:editing?.id,
        name:cleanName,
        balanceMinor,
        goalMinor,
        targetDate:targetDate||null,
        note:note.trim()||null,
        institutionName:institution.trim()||null,
        scope:editing?.scope==='personal'?'personal':editing?'household':scope
      });
      let photoProblem=false;
      try{
        if(removeCover&&editing?.hasCover) await deleteSavingsPotCover(householdId,result.potId);
        if(coverFile) await uploadSavingsPotCover(householdId,result.potId,coverFile);
      }catch{
        photoProblem=true;
      }
      resetEditorState();
      await load();
      setNotice(photoProblem
        ? l('O cofrinho foi salvo. Só a foto não conseguiu ser enviada; você pode tentar novamente em Editar.','The savings pot was saved. Only the photo failed to upload; you can try again in Edit.','La alcancía se guardó. Solo la foto no se pudo subir; puedes intentarlo de nuevo en Editar.')
        : l('Cofrinho salvo.','Savings pot saved.','Alcancía guardada.'));
    }catch{
      setFormError(l('Não conseguimos guardar essa alteração agora.','We could not save this change right now.','No pudimos guardar este cambio ahora.'));
    }finally{
      setSaving(false);
    }
  }
  function configureAutomationFromPot(pot:HomeSavingsPot){
    const a=pot.automation;
    setAutomationEnabled(Boolean(a?.enabled));
    setAutomationKind(a?.kind||'frequency');
    setAutomationMode(a?.mode||'fixed');
    setAutomationFrequency(a?.frequency||'monthly');
    setAutomationStartDate(a?.kind==='frequency'?(a.anchorDate||''):'');
    if(a?.mode==='percent'&&a.percentBps){
      setAutomationValue((a.percentBps/100).toLocaleString(intlLocale,{maximumFractionDigits:2,useGrouping:false}));
    }else if(a?.amountMinor){
      setAutomationValue(formatInput(a.amountMinor));
    }else{
      setAutomationValue('');
    }
  }
  async function openDetail(pot:HomeSavingsPot){
    setSelected(pot);
    setActivities([]);
    setDetailError('');
    setMoveMode(null);
    setMoveInput('');
    setMoveNote('');
    setAutomationEditing(false);
    configureAutomationFromPot(pot);
    setDetailLoading(true);
    try{
      const detail=await getSavingsPotDetail(householdId,pot.id);
      setActivities(detail.activities);
    }catch{
      setDetailError(l('Não conseguimos abrir o histórico agora.','We could not open the history right now.','No pudimos abrir el historial ahora.'));
    }finally{
      setDetailLoading(false);
    }
  }
  async function reloadSelected(){
    if(!selected) return;
    const data=await loadHomeData(householdId);
    setPots(data.savingsPots||[]);
    const fresh=(data.savingsPots||[]).find(item=>item.id===selected.id)||null;
    setSelected(fresh);
    if(fresh) configureAutomationFromPot(fresh);
    const detail=await getSavingsPotDetail(householdId,selected.id);
    setActivities(detail.activities);
  }
  async function submitMove(){
    if(!selected||!moveMode||moveWorking) return;
    const amountMinor=parseMoneyInputToMinor(moveInput,locale);
    if(amountMinor===null||amountMinor<=0){
      setDetailError(l('Digite um valor válido.','Enter a valid amount.','Escribe un valor válido.'));
      return;
    }
    if(moveMode==='withdraw'&&amountMinor>selected.balanceMinor){
      setDetailError(l('Você não pode retirar mais do que o saldo deste cofrinho.','You cannot withdraw more than this savings pot balance.','No puedes retirar más que el saldo de esta alcancía.'));
      return;
    }
    setMoveWorking(true);
    setDetailError('');
    try{
      await moveSavingsPot({householdId,potId:selected.id,direction:moveMode,amountMinor,note:moveNote.trim()||null});
      setMoveMode(null);
      setMoveInput('');
      setMoveNote('');
      await reloadSelected();
    }catch(err:any){
      setDetailError(String(err?.message||'')==='SAVINGS_POT_INSUFFICIENT_BALANCE'
        ? l('Esse cofrinho não tem esse valor disponível.','This savings pot does not have that amount available.','Esta alcancía no tiene ese valor disponible.')
        : l('Não conseguimos atualizar o saldo agora.','We could not update the balance right now.','No pudimos actualizar el saldo ahora.'));
    }finally{
      setMoveWorking(false);
    }
  }
  async function saveAutomation(){
    if(!selected||automationWorking) return;
    if(selected.source==='screen_import'){
      setDetailError(l('Cofrinhos importados do banco são atualizados pelo próximo print para evitar inventar movimentações.','Bank-imported savings pots are updated by the next screenshot so we do not invent movements.','Las alcancías importadas del banco se actualizan con la próxima captura para no inventar movimientos.'));
      return;
    }
    let automation:SavingsPotAutomation|null=null;
    if(automationEnabled){
      if(automationKind==='roundup'){
        automation={
          enabled:true,
          kind:'roundup',
          mode:'fixed',
          amountMinor:null,
          percentBps:null,
          frequency:null,
          anchorDate:selected.automation?.anchorDate||todayKey()
        };
      }else if(automationKind==='frequency'||automationMode==='fixed'){
        const amountMinor=parseMoneyInputToMinor(automationValue,locale);
        if(amountMinor===null||amountMinor<=0){
          setDetailError(l('Informe quanto deseja reservar automaticamente.','Enter how much you want to save automatically.','Indica cuánto quieres ahorrar automáticamente.'));
          return;
        }
        automation={
          enabled:true,
          kind:automationKind,
          mode:'fixed',
          amountMinor,
          percentBps:null,
          frequency:automationKind==='frequency'?automationFrequency:null,
          anchorDate:automationKind==='frequency'?(automationStartDate||selected.automation?.anchorDate||null):(selected.automation?.anchorDate||todayKey())
        };
      }else{
        const numeric=Number(automationValue.replace(',','.'));
        if(!Number.isFinite(numeric)||numeric<=0||numeric>100){
          setDetailError(l('Informe um percentual entre 0 e 100.','Enter a percentage between 0 and 100.','Indica un porcentaje entre 0 y 100.'));
          return;
        }
        automation={
          enabled:true,
          kind:automationKind,
          mode:'percent',
          amountMinor:null,
          percentBps:Math.round(numeric*100),
          frequency:null,
          anchorDate:selected.automation?.anchorDate||todayKey()
        };
      }
    }
    setAutomationWorking(true);
    setDetailError('');
    try{
      await updateSavingsPotAutomation({householdId,potId:selected.id,automation});
      await syncSavingsPotAutomations(householdId).catch(()=>undefined);
      setAutomationEditing(false);
      await reloadSelected();
    }catch{
      setDetailError(l('Não conseguimos guardar essa automação agora.','We could not save this automation right now.','No pudimos guardar esta automatización ahora.'));
    }finally{
      setAutomationWorking(false);
    }
  }
  async function archiveSelected(){
    if(!selected||moveWorking) return;
    if(selected.balanceMinor!==0){
      setDetailError(l('Retire o saldo antes de finalizar este cofrinho.','Withdraw the balance before finishing this savings pot.','Retira el saldo antes de finalizar esta alcancía.'));
      return;
    }
    setMoveWorking(true);
    setDetailError('');
    try{
      await archiveSavingsPot(householdId,selected.id);
      setSelected(null);
      await load();
    }catch{
      setDetailError(l('Não conseguimos finalizar este cofrinho agora.','We could not finish this savings pot right now.','No pudimos finalizar esta alcancía ahora.'));
    }finally{
      setMoveWorking(false);
    }
  }
  const startMove=(mode:MoveMode,value='',moveNoteValue='')=>{
    setMoveMode(mode);
    setMoveInput(value);
    setMoveNote(moveNoteValue);
    setDetailError('');
  };
  const cancelAutomation=()=>{
    setAutomationEditing(false);
    if(selected) configureAutomationFromPot(selected);
  };
  return <AppShell className="accounts-shell pots-shell" subtitle={l('Cofrinhos','Savings pots','Alcancías')} canContribute={canContribute} headerActions={<Link href="/documents" className="ghost-button">{l('Documentos','Documents','Documentos')}</Link>}>
    <PotsOverview {...{householdId,canContribute,view,loading,groups,total,institutionCount,reachedCount,goalsTotal,remainingTotal,error,notice}} onViewChange={setView} onOpenNew={openNew} onOpenDetail={openDetail} onOpenEdit={openEdit}/>
    <PotEditorSheet
      {...{householdId,creating,editing,scope,saving,coverPreview,removeCover,name,balanceInput,goalInput,targetDate,institution,note,formError}}
      onClose={closeEditor} onScopeChange={setScope} onChooseCover={chooseCover} onRemoveCover={()=>{chooseCover(null);setRemoveCover(true);}}
      onNameChange={setName} onBalanceChange={setBalanceInput} onGoalChange={setGoalInput} onTargetDateChange={setTargetDate} onInstitutionChange={setInstitution} onNoteChange={setNote} onSave={save}
    />
    {selected&&<PotDetailSheet
      {...{householdId,selected,canContribute,moveWorking,automationWorking,moveMode,moveInput,moveNote,detailError,automationEditing,automationEnabled,automationKind,automationMode,automationFrequency,automationStartDate,automationValue,activities,detailLoading}}
      onClose={()=>setSelected(null)} onEdit={()=>{setSelected(null);openEdit(selected);}} onMoveInputChange={setMoveInput} onMoveNoteChange={setMoveNote} onStartMove={startMove} onCancelMove={()=>setMoveMode(null)} onSubmitMove={submitMove}
      onAutomationEditingChange={setAutomationEditing} onAutomationEnabledChange={setAutomationEnabled} onAutomationKindChange={setAutomationKind} onAutomationModeChange={setAutomationMode} onAutomationFrequencyChange={setAutomationFrequency} onAutomationStartDateChange={setAutomationStartDate} onAutomationValueChange={setAutomationValue}
      onCancelAutomation={cancelAutomation} onSaveAutomation={saveAutomation} onArchive={archiveSelected}
    />}
  </AppShell>;
}
