'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppNav } from '@/src/features/navigation/app-nav';
import { HouseholdLink } from '@/src/features/navigation/household-link';
import { SavingsPotCover } from '@/src/features/pots/pot-cover';
import type { HouseholdRole } from '@/src/core/household';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { cleanSavingsPotDisplayName, groupSavingsPots } from '@/src/core/savings-pots';
import { savingsPotGoalPace } from '@/src/core/savings-pot-goal';
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
  upsertSavingsPot,
  type SavingsPotActivity
} from '@/src/lib/repositories/savings-pots';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import { useI18n } from '@/src/i18n/locale-provider';

type MoveMode='reserve'|'withdraw';

function todayKey(){
  return new Date().toISOString().slice(0,10);
}

export function PotsScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {locale,intlLocale,formatMoney,formatDate}=useI18n();
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
      setPots(data.savingsPots||[]);
      if(selected){
        const fresh=(data.savingsPots||[]).find(item=>item.id===selected.id)||null;
        setSelected(fresh);
      }
    }catch{
      setError(l('Não conseguimos carregar seus cofrinhos agora.','We could not load your savings pots right now.','No pudimos cargar tus alcancías ahora.'));
    }finally{
      if(!silent) setLoading(false);
    }
  }

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

  function automationLabel(value:SavingsPotAutomation|null|undefined){
    if(!value?.enabled) return null;
    if(value.kind==='frequency'){
      const cadence=value.frequency==='daily'?l('todo dia','every day','cada día'):value.frequency==='weekly'?l('toda semana','every week','cada semana'):value.frequency==='biweekly'?l('a cada 15 dias','every 15 days','cada 15 días'):l('todo mês','every month','cada mes');
      return l(`Reserva automática ${cadence}`,`Automatic saving ${cadence}`,`Ahorro automático ${cadence}`);
    }
    if(value.kind==='roundup') return l('Arredonda seus gastos','Rounds up your spending','Redondea tus gastos');
    return value.kind==='spend'
      ? l('Reserva quando você gasta','Saves when you spend','Ahorra cuando gastas')
      : l('Reserva quando você recebe','Saves when money comes in','Ahorra cuando recibes');
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

  function activityLabel(activity:SavingsPotActivity){
    if(activity.type==='reserve') return l('Você reservou','You saved','Reservaste');
    if(activity.type==='withdraw') return l('Você retirou','You withdrew','Retiraste');
    if(activity.type==='automatic_reserve') return l('Reserva automática','Automatic saving','Ahorro automático');
    if(activity.type==='screen_sync') return l('Atualizado por print','Updated from screenshot','Actualizado por captura');
    if(activity.type==='created') return l('Cofrinho criado','Savings pot created','Alcancía creada');
    if(activity.type==='balance_adjustment') return l('Saldo ajustado','Balance adjusted','Saldo ajustado');
    return l('Atualização','Update','Actualización');
  }

  const selectedPace=selected?savingsPotGoalPace(selected.balanceMinor,selected.goalMinor,selected.targetDate):null;

  return <main className="app-shell accounts-shell pots-shell">
    <header className="topbar">
      <div>
        <div className="eyebrow">NestBalance</div>
        <span className="topbar-subtitle">{l('Cofrinhos','Savings pots','Alcancías')}</span>
      </div>
      <div className="topbar-actions">
        <Link href="/documents" className="ghost-button">{l('Documentos','Documents','Documentos')}</Link>
        <HouseholdLink/>
      </div>
    </header>

    <ScopeViewSwitch value={view} onChange={setView}/>

    <section className="area-hero accounts-hero pots-hero">
      <span>{l('Dinheiro com propósito','Money with a purpose','Dinero con propósito')}</span>
      <h1>{loading
        ? l('Organizando seus cofrinhos…','Organizing your savings pots…','Organizando tus alcancías…')
        : groups.length
          ? formatMoney(total)
          : l('Crie uma meta. Ou mande um print.','Create a goal. Or send a screenshot.','Crea una meta. O envía una captura.')}</h1>
      <p>{groups.length
        ? l(
            `${groups.length} objetivo${groups.length===1?'':'s'} · ${institutionCount} ${institutionCount===1?'origem':'origens'} · ${reachedCount} concluído${reachedCount===1?'':'s'}.`,
            `${groups.length} goal${groups.length===1?'':'s'} · ${institutionCount} source${institutionCount===1?'':'s'} · ${reachedCount} reached.`,
            `${groups.length} objetivo${groups.length===1?'':'s'} · ${institutionCount} origen${institutionCount===1?'':'es'} · ${reachedCount} cumplido${reachedCount===1?'':'s'}.`
          )
        : l(
            'Você pode criar um cofrinho completo manualmente ou mandar uma tela do banco para o NestBalance reconhecer vários de uma vez.',
            'Create a complete savings pot manually or send a bank screenshot so NestBalance can recognize several at once.',
            'Puedes crear una alcancía completa manualmente o enviar una captura del banco para que NestBalance reconozca varias de una vez.'
          )}</p>
      {groups.length>0&&goalsTotal>0&&<div className="pots-hero-facts">
        <div><span>{l('Ainda falta nas metas','Still needed for goals','Aún falta en las metas')}</span><strong>{formatMoney(remainingTotal)}</strong></div>
        <div><span>{l('Metas definidas','Goals defined','Metas definidas')}</span><strong>{groups.filter(item=>item.goalMinor).length}</strong></div>
      </div>}
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {notice&&<p className="success-copy" role="status">{notice}</p>}

    {canContribute&&<section>
      <div className="section-title">
        <div>
          <span className="section-kicker">{l('DO SEU JEITO','YOUR WAY','A TU MANERA')}</span>
          <h2>{l('Começar leva poucos segundos','Get started in seconds','Empieza en segundos')}</h2>
        </div>
      </div>
      <div className="account-balance-grid pots-quick-grid">
        <Link href="/add?return=/pots" className="account-balance-tile pots-action-tile pots-import-action">
          <span>{l('Já tem no banco','Already in your bank','Ya está en tu banco')}</span>
          <h3>{l('Importar por print','Import from screenshot','Importar por captura')}</h3>
          <strong>{l('Vários de uma vez','Several at once','Varios a la vez')}</strong>
          <small>{l('Reconhecemos nome, saldo, meta, prazo quando aparecer e atualizamos o que já existe.','We recognize name, balance, goal, deadline when visible, and update what already exists.','Reconocemos nombre, saldo, meta, plazo cuando aparece y actualizamos lo que ya existe.')}</small>
        </Link>
        <button type="button" className="account-balance-tile pots-action-tile" onClick={openNew}>
          <span>{l('Quer criar aqui','Create it here','Quieres crearla aquí')}</span>
          <h3>{l('Novo cofrinho','New savings pot','Nueva alcancía')}</h3>
          <strong>{l('Foto + meta + prazo','Photo + goal + deadline','Foto + meta + plazo')}</strong>
          <small>{l('Dê nome ao objetivo, coloque uma foto e acompanhe cada reserva até chegar lá.','Name the goal, add a photo, and track every contribution until you get there.','Nombra el objetivo, agrega una foto y acompaña cada aporte hasta llegar.')}</small>
        </button>
      </div>
    </section>}

    <section className="savings-pots-section">
      <div className="section-title">
        <div>
          <h2>{l('Seus cofrinhos','Your savings pots','Tus alcancías')}</h2>
          <span>{l('o mesmo objetivo em bancos diferentes aparece junto','the same goal across different banks appears together','el mismo objetivo en bancos distintos aparece junto')}</span>
        </div>
      </div>

      {loading
        ? <div className="savings-pot-grid savings-pot-premium-grid">{[0,1,2].map(i=><div className="savings-pot-card skeleton-line" key={i}/>)}</div>
        : groups.length===0
          ? <div className="empty-state empty-state-action">
              <div>
                <h3>{l('Seu primeiro cofrinho pode nascer de um print ou do zero.','Your first savings pot can start from a screenshot or from scratch.','Tu primera alcancía puede nacer de una captura o desde cero.')}</h3>
                <p>{l('Se já existe no banco, importe. Se é uma nova meta, crie aqui com nome, foto, valor-alvo e prazo.','If it already exists at your bank, import it. If it is a new goal, create it here with a name, photo, target amount, and deadline.','Si ya existe en tu banco, impórtala. Si es una meta nueva, créala aquí con nombre, foto, valor objetivo y plazo.')}</p>
              </div>
              {canContribute&&<button className="primary-button" type="button" onClick={openNew}>{l('Criar meu primeiro cofrinho','Create my first savings pot','Crear mi primera alcancía')}</button>}
            </div>
          : <div className="savings-pot-grid savings-pot-premium-grid">
              {groups.map(group=>{
                const pace=savingsPotGoalPace(group.balanceMinor,group.goalMinor,group.targetDate);
                const coverSource=group.coverSourceId?group.sources.find(item=>item.id===group.coverSourceId)||null:null;
                return <article className="savings-pot-card savings-pot-premium-card" key={group.key}>
                  <SavingsPotCover
                    householdId={householdId}
                    potId={coverSource?.id||group.sources[0].id}
                    name={group.name}
                    hasCover={Boolean(coverSource?.hasCover)}
                    coverVersion={coverSource?.coverVersion||null}
                  />
                  <div className="savings-pot-card-body">
                    <div className="savings-pot-card-kicker">
                      <span>{group.sources.length===1
                        ? group.sources[0].institutionName||l('Criado no NestBalance','Created in NestBalance','Creado en NestBalance')
                        : l(`${group.sources.length} origens`,`${group.sources.length} sources`,`${group.sources.length} orígenes`)}</span>
                      {group.scope==='personal'&&<em className="personal-pill">{l('Só eu','Only me','Solo yo')}</em>}
                    </div>
                    <h3>{group.name}</h3>
                    <strong>{formatMoney(group.balanceMinor)}</strong>

                    {group.goalMinor&&group.goalMinor>0
                      ? <>
                          <div className="savings-pot-progress-copy">
                            <span>{l('Meta','Goal','Meta')} {formatMoney(group.goalMinor)}</span>
                            <b>{Math.round((group.progress||0)*100)}%</b>
                          </div>
                          <progress max={group.goalMinor} value={Math.min(group.balanceMinor,group.goalMinor)} aria-label={l('Progresso da meta','Goal progress','Progreso de la meta')}/>
                          <small>{pace.reached
                            ? l('Meta alcançada.','Goal reached.','Meta alcanzada.')
                            : group.targetDate&&pace.daysRemaining!==null&&pace.daysRemaining>=0
                              ? l(
                                  `Faltam ${formatMoney(pace.remainingMinor)} · cerca de ${formatMoney(pace.suggestedMonthlyMinor||0)}/mês até ${formatDate(new Date(group.targetDate+'T12:00:00'),{day:'2-digit',month:'short'})}.`,
                                  `${formatMoney(pace.remainingMinor)} left · about ${formatMoney(pace.suggestedMonthlyMinor||0)}/month until ${formatDate(new Date(group.targetDate+'T12:00:00'),{day:'2-digit',month:'short'})}.`,
                                  `Faltan ${formatMoney(pace.remainingMinor)} · cerca de ${formatMoney(pace.suggestedMonthlyMinor||0)}/mes hasta ${formatDate(new Date(group.targetDate+'T12:00:00'),{day:'2-digit',month:'short'})}.`
                                )
                              : l(`Faltam ${formatMoney(pace.remainingMinor)}.`,`${formatMoney(pace.remainingMinor)} left.`,`Faltan ${formatMoney(pace.remainingMinor)}.`)}</small>
                        </>
                      : <small>{l('Defina uma meta para acompanhar o progresso.','Set a goal to track progress.','Define una meta para seguir el progreso.')}</small>}

                    {group.automation?.enabled&&<div className="savings-pot-automation-pill">{automationLabel(group.automation)}</div>}
                    {group.goalConflict&&<small className="pot-warning">{l('As origens têm metas diferentes; mostramos a maior.','Sources have different goals; we show the highest.','Los orígenes tienen metas distintas; mostramos la mayor.')}</small>}

                    <div className="savings-pot-card-actions">
                      {group.sources.length===1
                        ? <>
                            <button type="button" onClick={()=>void openDetail(group.sources[0])}>{l('Abrir','Open','Abrir')}</button>
                            {canContribute&&<button type="button" className="secondary" onClick={()=>openEdit(group.sources[0])}>{l('Editar','Edit','Editar')}</button>}
                          </>
                        : group.sources.map(source=><button type="button" key={source.id} onClick={()=>void openDetail(source)}>
                            {source.institutionName||l('Manual','Manual','Manual')} · {formatMoney(source.balanceMinor)}
                          </button>)}
                    </div>
                  </div>
                </article>;
              })}
            </div>}
    </section>

    <section className="pots-trust-note">
      <div>
        <span className="section-kicker">{l('IMPORTANTE','IMPORTANT','IMPORTANTE')}</span>
        <h3>{l('Organizar não é movimentar seu banco.','Organizing is not moving money at your bank.','Organizar no es mover dinero en tu banco.')}</h3>
      </div>
      <p>{l(
        'Reservar ou retirar aqui atualiza sua organização no NestBalance. Em cofrinhos importados, o próximo print pode sincronizar o saldo real. Em nenhum caso tratamos uma reserva entre recursos seus como nova despesa ou nova renda.',
        'Saving or withdrawing here updates your NestBalance organization. For imported savings pots, the next screenshot can sync the real balance. We never treat a transfer between your own funds as new spending or new income.',
        'Reservar o retirar aquí actualiza tu organización en NestBalance. En alcancías importadas, la próxima captura puede sincronizar el saldo real. Nunca tratamos un movimiento entre tus propios fondos como un gasto o ingreso nuevo.'
      )}</p>
    </section>

    <AppNav canContribute={canContribute}/>

    {(creating||editing)&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&closeEditor()}>
      <section className="capture-sheet pot-editor-sheet" role="dialog" aria-modal="true" aria-label={creating?l('Criar cofrinho','Create savings pot','Crear alcancía'):l('Editar cofrinho','Edit savings pot','Editar alcancía')}>
        <div className="sheet-handle"/>
        <div className="eyebrow">{creating?l('NOVO OBJETIVO','NEW GOAL','NUEVO OBJETIVO'):l('DETALHES DO COFRINHO','SAVINGS POT DETAILS','DETALLES DE LA ALCANCÍA')}</div>
        <h2>{creating?l('Dê um rosto para essa meta.','Give this goal a face.','Dale una cara a esta meta.'):editing?.name}</h2>
        <p>{l('Nome, foto, meta e prazo ajudam a transformar “guardar dinheiro” em algo concreto.','Name, photo, goal, and deadline turn “saving money” into something concrete.','Nombre, foto, meta y plazo convierten “ahorrar dinero” en algo concreto.')}</p>

        {creating&&<ScopeChoice value={scope} onChange={setScope} disabled={saving}/>}

        <div className="pot-cover-editor">
          {coverPreview
            ? <img src={coverPreview} alt={l('Prévia da foto do cofrinho','Savings pot photo preview','Vista previa de la foto de la alcancía')}/>
            : editing?.hasCover&&!removeCover
              ? <SavingsPotCover householdId={householdId} potId={editing.id} name={editing.name} hasCover coverVersion={editing.coverVersion}/>
              : <div className="pot-cover-placeholder"><span>{l('Sem foto','No photo','Sin foto')}</span></div>}
          <div>
            <label className="ghost-button pot-photo-button">
              {editing?.hasCover&&!removeCover?l('Trocar foto','Change photo','Cambiar foto'):l('Escolher foto','Choose photo','Elegir foto')}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>chooseCover(e.target.files?.[0]||null)} disabled={saving}/>
            </label>
            {(coverFile||(editing?.hasCover&&!removeCover))&&<button type="button" className="text-button" disabled={saving} onClick={()=>{
              chooseCover(null);
              setRemoveCover(true);
            }}>{l('Remover foto','Remove photo','Quitar foto')}</button>}
            <small>{l('JPG, PNG ou WebP · até 5 MB.','JPG, PNG, or WebP · up to 5 MB.','JPG, PNG o WebP · hasta 5 MB.')}</small>
          </div>
        </div>

        <div className="pot-editor-grid">
          <label>
            <span className="field-label">{l('Nome','Name','Nombre')}</span>
            <input className="pot-text-input" value={name} onChange={e=>setName(e.target.value)} placeholder={l('Ex.: Aniversário Davi','E.g. Davi birthday','Ej.: Cumpleaños Davi')} maxLength={80}/>
          </label>

          {creating&&<label>
            <span className="field-label">{l('Quanto já tem','Already saved','Cuánto ya tienes')}</span>
            <div className="money-input-wrap"><span>R$</span><input inputMode="decimal" value={balanceInput} onChange={e=>setBalanceInput(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
          </label>}

          <label>
            <span className="field-label">{l('Meta (opcional)','Goal (optional)','Meta (opcional)')}</span>
            <div className="money-input-wrap"><span>R$</span><input inputMode="decimal" value={goalInput} onChange={e=>setGoalInput(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
          </label>

          <label>
            <span className="field-label">{l('Quero chegar lá até (opcional)','Target date (optional)','Quiero llegar hasta (opcional)')}</span>
            <input className="pot-text-input" type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/>
          </label>

          <label className="pot-editor-wide">
            <span className="field-label">{l('Onde esse dinheiro está (opcional)','Where this money is (optional)','Dónde está este dinero (opcional)')}</span>
            <input className="pot-text-input" value={institution} onChange={e=>setInstitution(e.target.value)} placeholder={l('Ex.: Mercado Pago, Nubank, dinheiro em casa…','E.g. Mercado Pago, Nubank, cash at home…','Ej.: Mercado Pago, Nubank, efectivo en casa…')} maxLength={80}/>
          </label>

          <label className="pot-editor-wide">
            <span className="field-label">{l('Uma frase para lembrar o porquê (opcional)','A note to remember why (optional)','Una frase para recordar por qué (opcional)')}</span>
            <textarea className="pot-note-input" value={note} onChange={e=>setNote(e.target.value)} placeholder={l('Ex.: Festa de 2 anos do Davi','E.g. Davi’s 2nd birthday','Ej.: Fiesta de 2 años de Davi')} maxLength={280} rows={3}/>
          </label>
        </div>

        {editing&&<div className="pot-balance-edit-hint">
          <strong>{l('Saldo atual','Current balance','Saldo actual')} · {formatMoney(editing.balanceMinor)}</strong>
          <span>{l('Para mudar o saldo, abra o cofrinho e use Reservar ou Retirar. Assim o histórico fica correto.','To change the balance, open the savings pot and use Save or Withdraw so the history stays accurate.','Para cambiar el saldo, abre la alcancía y usa Reservar o Retirar para mantener el historial correcto.')}</span>
        </div>}

        {formError&&<p className="error-copy" role="alert">{formError}</p>}

        <div className="sheet-actions">
          <button className="ghost-button" disabled={saving} onClick={closeEditor}>{l('Cancelar','Cancel','Cancelar')}</button>
          <button className="primary-button" disabled={saving} onClick={()=>void save()}>{saving?l('Guardando…','Saving…','Guardando…'):l('Guardar cofrinho','Save savings pot','Guardar alcancía')}</button>
        </div>
      </section>
    </div>}

    {selected&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!moveWorking&&!automationWorking&&setSelected(null)}>
      <section className="capture-sheet pot-detail-sheet" role="dialog" aria-modal="true" aria-label={selected.name}>
        <div className="sheet-handle"/>
        <SavingsPotCover householdId={householdId} potId={selected.id} name={selected.name} hasCover={selected.hasCover} coverVersion={selected.coverVersion} className="savings-pot-cover-detail"/>

        <div className="pot-detail-heading">
          <div>
            <span>{selected.institutionName||l('Criado no NestBalance','Created in NestBalance','Creado en NestBalance')}</span>
            <h2>{selected.name}</h2>
          </div>
          {canContribute&&<button className="ghost-button" type="button" onClick={()=>{setSelected(null);openEdit(selected);}}>{l('Editar','Edit','Editar')}</button>}
        </div>

        <div className="pot-detail-balance">
          <span>{l('Guardado agora','Saved now','Guardado ahora')}</span>
          <strong>{formatMoney(selected.balanceMinor)}</strong>
          {selected.goalMinor&&selected.goalMinor>0&&<>
            <div><span>{l('Meta','Goal','Meta')} {formatMoney(selected.goalMinor)}</span><b>{Math.round(Math.min(1,selected.balanceMinor/selected.goalMinor)*100)}%</b></div>
            <progress max={selected.goalMinor} value={Math.min(selected.balanceMinor,selected.goalMinor)}/>
          </>}
        </div>

        {selected.goalMinor&&selectedPace&&<div className="pot-goal-insight">
          {selectedPace.reached
            ? <><strong>{l('Meta alcançada','Goal reached','Meta alcanzada')}</strong><span>{l('Você chegou ao valor que definiu. Pode continuar guardando ou usar o dinheiro quando chegar a hora.','You reached the amount you set. You can keep saving or use the money when the time comes.','Llegaste al valor definido. Puedes seguir ahorrando o usar el dinero cuando llegue el momento.')}</span></>
            : selectedPace.overdue
              ? <><strong>{l('O prazo passou','The deadline passed','El plazo pasó')}</strong><span>{l(`Ainda faltam ${formatMoney(selectedPace.remainingMinor)}. Você pode ajustar a data sem perder o histórico.`,`${formatMoney(selectedPace.remainingMinor)} is still needed. You can adjust the date without losing history.`,`Aún faltan ${formatMoney(selectedPace.remainingMinor)}. Puedes ajustar la fecha sin perder el historial.`)}</span></>
              : <><strong>{l(`Faltam ${formatMoney(selectedPace.remainingMinor)}`,`${formatMoney(selectedPace.remainingMinor)} left`,`Faltan ${formatMoney(selectedPace.remainingMinor)}`)}</strong><span>{selected.targetDate&&selectedPace.suggestedMonthlyMinor
                  ? l(
                      `Para chegar até ${formatDate(new Date(selected.targetDate+'T12:00:00'),{day:'2-digit',month:'long',year:'numeric'})}, a referência é cerca de ${formatMoney(selectedPace.suggestedMonthlyMinor)} por mês ou ${formatMoney(selectedPace.suggestedWeeklyMinor||0)} por semana.`,
                      `To get there by ${formatDate(new Date(selected.targetDate+'T12:00:00'),{day:'2-digit',month:'long',year:'numeric'})}, a useful reference is about ${formatMoney(selectedPace.suggestedMonthlyMinor)} per month or ${formatMoney(selectedPace.suggestedWeeklyMinor||0)} per week.`,
                      `Para llegar hasta ${formatDate(new Date(selected.targetDate+'T12:00:00'),{day:'2-digit',month:'long',year:'numeric'})}, una referencia útil es cerca de ${formatMoney(selectedPace.suggestedMonthlyMinor)} por mes o ${formatMoney(selectedPace.suggestedWeeklyMinor||0)} por semana.`
                    )
                  : l('Defina um prazo se quiser que o NestBalance calcule um ritmo sugerido.','Set a deadline if you want NestBalance to calculate a suggested pace.','Define un plazo si quieres que NestBalance calcule un ritmo sugerido.')}</span></>}
          {!selectedPace.reached&&selectedPace.suggestedMonthlyMinor&&canContribute&&<button type="button" className="pot-goal-quick-action" onClick={()=>{
            setMoveMode('reserve');
            setMoveInput(formatInput(selectedPace.suggestedMonthlyMinor||0));
            setMoveNote(l('Valor sugerido para a meta','Suggested goal amount','Valor sugerido para la meta'));
            setDetailError('');
          }}>{l(`Reservar ${formatMoney(selectedPace.suggestedMonthlyMinor)} agora`,`Save ${formatMoney(selectedPace.suggestedMonthlyMinor)} now`,`Reservar ${formatMoney(selectedPace.suggestedMonthlyMinor)} ahora`)}</button>}
        </div>}

        {selected.note&&<p className="pot-detail-note">{selected.note}</p>}

        {canContribute&&<div className="pot-money-actions">
          <button type="button" onClick={()=>{setMoveMode('reserve');setMoveInput('');setMoveNote('');setDetailError('');}}>{l('Reservar','Save','Reservar')}</button>
          <button type="button" className="secondary" disabled={selected.balanceMinor<=0} onClick={()=>{setMoveMode('withdraw');setMoveInput('');setMoveNote('');setDetailError('');}}>{l('Retirar','Withdraw','Retirar')}</button>
        </div>}

        {moveMode&&<div className="pot-inline-panel">
          <div>
            <span className="section-kicker">{moveMode==='reserve'?l('RESERVAR','SAVE','RESERVAR'):l('RETIRAR','WITHDRAW','RETIRAR')}</span>
            <h3>{moveMode==='reserve'?l('Quanto você separou?','How much did you set aside?','¿Cuánto separaste?'):l('Quanto você tirou?','How much did you take out?','¿Cuánto retiraste?')}</h3>
          </div>
          <div className="money-input-wrap"><span>R$</span><input autoFocus inputMode="decimal" value={moveInput} onChange={e=>setMoveInput(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
          <input className="pot-text-input" value={moveNote} onChange={e=>setMoveNote(e.target.value)} placeholder={l('Observação opcional','Optional note','Nota opcional')} maxLength={160}/>
          <small>{l('Isso atualiza sua organização no NestBalance; não envia ordem para o banco.','This updates your NestBalance organization; it does not send an order to your bank.','Esto actualiza tu organización en NestBalance; no envía una orden al banco.')}</small>
          <div className="sheet-actions">
            <button className="ghost-button" disabled={moveWorking} onClick={()=>setMoveMode(null)}>{l('Cancelar','Cancel','Cancelar')}</button>
            <button className="primary-button" disabled={moveWorking} onClick={()=>void submitMove()}>{moveWorking?l('Guardando…','Saving…','Guardando…'):moveMode==='reserve'?l('Confirmar reserva','Confirm saving','Confirmar reserva'):l('Confirmar retirada','Confirm withdrawal','Confirmar retiro')}</button>
          </div>
        </div>}

        <section className="pot-automation-section">
          <div className="section-title">
            <div>
              <span className="section-kicker">{l('AUTOMAÇÃO','AUTOMATION','AUTOMATIZACIÓN')}</span>
              <h3>{l('Guardar sem depender da memória','Save without relying on memory','Ahorrar sin depender de la memoria')}</h3>
            </div>
            {selected.source!=='screen_import'&&canContribute&&<button type="button" className="section-action" onClick={()=>setAutomationEditing(value=>!value)}>{automationEditing?l('Fechar','Close','Cerrar'):l('Configurar','Set up','Configurar')}</button>}
          </div>

          {selected.source==='screen_import'
            ? <div className="pot-automation-explainer">
                <strong>{l('Este cofrinho veio de um banco.','This savings pot came from a bank.','Esta alcancía vino de un banco.')}</strong>
                <span>{l('Para o saldo continuar fiel ao banco, não criamos reservas automáticas aqui. Quando mudar, mande outro print e atualizamos sem duplicar.','To keep the balance faithful to the bank, we do not create automatic savings here. When it changes, send another screenshot and we update it without duplicates.','Para que el saldo siga fiel al banco, no creamos ahorros automáticos aquí. Cuando cambie, envía otra captura y lo actualizamos sin duplicar.')}</span>
              </div>
            : <>
                {!automationEditing&&<div className={selected.automation?.enabled?'pot-automation-summary active':'pot-automation-summary'}>
                  <strong>{selected.automation?.enabled?automationLabel(selected.automation):l('Automação desligada','Automation off','Automatización desactivada')}</strong>
                  <span>{selected.automation?.enabled
                    ? l('O NestBalance registra essas reservas automaticamente quando os gatilhos aparecem nos seus dados.','NestBalance records these savings automatically when the triggers appear in your data.','NestBalance registra estos ahorros automáticamente cuando los disparadores aparecen en tus datos.')
                    : l('Você decide se quer reservar por frequência, quando gastar ou quando receber.','You decide whether to save by schedule, when you spend, or when money comes in.','Tú decides si quieres ahorrar por frecuencia, al gastar o al recibir.')}</span>
                </div>}

                {automationEditing&&<div className="pot-automation-editor">
                  <label className="pot-toggle-row">
                    <input type="checkbox" checked={automationEnabled} onChange={e=>setAutomationEnabled(e.target.checked)}/>
                    <span><strong>{l('Ativar reserva automática','Enable automatic saving','Activar ahorro automático')}</strong><small>{l('Só organiza dentro do NestBalance; não movimenta seu banco.','Only organizes inside NestBalance; it does not move money at your bank.','Solo organiza dentro de NestBalance; no mueve dinero en tu banco.')}</small></span>
                  </label>

                  {automationEnabled&&<>
                    <div className="pot-automation-kind-grid">
                      {([
                        ['frequency',l('Por frequência','By schedule','Por frecuencia'),l('Todo dia, semana, 15 dias ou mês','Daily, weekly, every 15 days, or monthly','Cada día, semana, 15 días o mes')],
                        ['spend',l('Quando eu gastar','When I spend','Cuando gaste'),l('A cada gasto conhecido','For each known expense','Por cada gasto conocido')],
                        ['income',l('Quando eu receber','When I receive','Cuando reciba'),l('A cada entrada conhecida','For each known income','Por cada ingreso conocido')],
                        ['roundup',l('Arredondar gastos','Round up spending','Redondear gastos'),l('Guarda os centavos até o próximo real','Saves the cents up to the next whole real','Guarda los centavos hasta el próximo real')]
                      ] as const).map(([kind,title,hint])=><button type="button" key={kind} className={automationKind===kind?'active':''} onClick={()=>setAutomationKind(kind)}>
                        <strong>{title}</strong><span>{hint}</span>
                      </button>)}
                    </div>

                    {automationKind==='frequency'
                      ? <>
                          <label>
                            <span className="field-label">{l('Frequência','Frequency','Frecuencia')}</span>
                            <select className="pot-text-input" value={automationFrequency} onChange={e=>setAutomationFrequency(e.target.value as SavingsPotFrequency)}>
                              <option value="daily">{l('Todo dia','Every day','Cada día')}</option>
                              <option value="weekly">{l('Toda semana','Every week','Cada semana')}</option>
                              <option value="biweekly">{l('A cada 15 dias','Every 15 days','Cada 15 días')}</option>
                              <option value="monthly">{l('Todo mês','Every month','Cada mes')}</option>
                            </select>
                          </label>
                          <label>
                            <span className="field-label">{l('Primeira reserva (opcional)','First saving date (optional)','Primera reserva (opcional)')}</span>
                            <input className="pot-text-input" type="date" value={automationStartDate} onChange={e=>setAutomationStartDate(e.target.value)}/>
                          </label>
                          <label>
                            <span className="field-label">{l('Quanto reservar','Amount to save','Cuánto reservar')}</span>
                            <div className="money-input-wrap"><span>R$</span><input inputMode="decimal" value={automationValue} onChange={e=>setAutomationValue(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
                          </label>
                        </>
                      : automationKind==='roundup'
                        ? <div className="pot-automation-explainer">
                            <strong>{l('Os centavos viram progresso.','Your cents become progress.','Tus centavos se convierten en progreso.')}</strong>
                            <span>{l('Exemplo: ao registrar um gasto de R$ 12,37, o NestBalance acrescenta R$ 0,63 ao acompanhamento deste cofrinho. Nada é debitado do banco.','Example: when you record a R$ 12.37 expense, NestBalance adds R$ 0.63 to this savings pot tracking. Nothing is debited from your bank.','Ejemplo: al registrar un gasto de R$ 12,37, NestBalance agrega R$ 0,63 al seguimiento de esta alcancía. No se debita nada del banco.')}</span>
                          </div>
                        : <>
                            <div className="pot-mode-tabs">
                              <button type="button" className={automationMode==='fixed'?'active':''} onClick={()=>setAutomationMode('fixed')}>{l('Valor fixo','Fixed amount','Valor fijo')}</button>
                              <button type="button" className={automationMode==='percent'?'active':''} onClick={()=>setAutomationMode('percent')}>{l('Percentual','Percentage','Porcentaje')}</button>
                            </div>
                            <label>
                              <span className="field-label">{automationMode==='fixed'?l('Quanto reservar','Amount to save','Cuánto reservar'):l('Percentual','Percentage','Porcentaje')}</span>
                              {automationMode==='fixed'
                                ? <div className="money-input-wrap"><span>R$</span><input inputMode="decimal" value={automationValue} onChange={e=>setAutomationValue(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
                                : <div className="pot-percent-input"><input inputMode="decimal" value={automationValue} onChange={e=>setAutomationValue(e.target.value)} placeholder="5"/><span>%</span></div>}
                            </label>
                          </>}
                  </>}

                  <div className="sheet-actions">
                    <button className="ghost-button" disabled={automationWorking} onClick={()=>{setAutomationEditing(false);configureAutomationFromPot(selected);}}>{l('Cancelar','Cancel','Cancelar')}</button>
                    <button className="primary-button" disabled={automationWorking} onClick={()=>void saveAutomation()}>{automationWorking?l('Guardando…','Saving…','Guardando…'):l('Salvar automação','Save automation','Guardar automatización')}</button>
                  </div>
                </div>}
              </>}
        </section>

        <section className="pot-history-section">
          <div className="section-title"><div><span className="section-kicker">{l('HISTÓRICO','HISTORY','HISTORIAL')}</span><h3>{l('Tudo que mudou neste cofrinho','Everything that changed here','Todo lo que cambió aquí')}</h3></div></div>
          {detailLoading
            ? <div className="pot-history-list">{[0,1,2].map(i=><div className="pot-history-row skeleton-line" key={i}/>)}</div>
            : activities.length===0
              ? <p className="pot-history-empty">{l('O histórico começa na próxima alteração de saldo.','History starts with the next balance change.','El historial comienza con el próximo cambio de saldo.')}</p>
              : <div className="pot-history-list">{activities.slice(0,12).map(activity=><div className="pot-history-row" key={activity.id}>
                  <div><strong>{activityLabel(activity)}</strong><span>{activity.createdAtMs?formatDate(new Date(activity.createdAtMs),{day:'2-digit',month:'short',year:'numeric'}):''}{activity.note?' · '+activity.note:''}</span></div>
                  <div><b>{activity.type==='withdraw'?'−':'+'} {formatMoney(activity.amountMinor)}</b><small>{l('saldo','balance','saldo')} {formatMoney(activity.resultingBalanceMinor)}</small></div>
                </div>)}</div>}
        </section>

        {detailError&&<p className="error-copy" role="alert">{detailError}</p>}

        <div className="pot-detail-footer">
          {canContribute&&selected.balanceMinor===0&&<button className="text-button danger-text" disabled={moveWorking} onClick={()=>void archiveSelected()}>{l('Finalizar este cofrinho','Finish this savings pot','Finalizar esta alcancía')}</button>}
          <button className="ghost-button" disabled={moveWorking||automationWorking} onClick={()=>setSelected(null)}>{l('Fechar','Close','Cerrar')}</button>
        </div>
      </section>
    </div>}
  </main>;
}
