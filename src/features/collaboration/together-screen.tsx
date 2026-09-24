'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import type { HouseholdRole } from '@/src/core/household';
import {
  createComment,
  createExpenseSplit,
  createSharedTask,
  loadCollaboration,
  loadComments,
  loadWeeklyRitual,
  saveWeeklyRitual,
  settleExpenseSplit,
  updateSharedTask,
  type CollaborationComment,
  type CollaborationMember,
  type ExpenseSplit,
  type SharedTask
} from '@/src/lib/repositories/collaboration';
import { loadHomeData } from '@/src/lib/repositories/home';
import { useHouseholdRevisionRefresh } from '@/src/features/realtime/use-household-revision';
import { AppShell } from '@/src/features/navigation/app-shell';
import { useI18n } from '@/src/i18n/locale-provider';
import { LinkedConversationPanel } from '@/src/features/collaboration/linked-conversation-panel';

function mondayKey(now=new Date()){
  const date=new Date(now);
  const day=date.getDay()||7;
  date.setDate(date.getDate()-day+1);
  const offset=date.getTimezoneOffset()*60_000;
  return new Date(date.getTime()-offset).toISOString().slice(0,10);
}

function equalShares(total:number,uids:string[]){
  if(!uids.length) return [];
  const base=Math.floor(total/uids.length);
  let remainder=total-base*uids.length;
  return uids.map(uid=>({uid,amountMinor:base+(remainder-->0?1:0)}));
}

export function TogetherScreen({householdId,role,uid}:{householdId:string;role:HouseholdRole;uid:string}){
  const {locale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const canContribute=role!=='read_only';
  const weekStart=useMemo(()=>mondayKey(),[]);
  const [members,setMembers]=useState<CollaborationMember[]>([]);
  const [tasks,setTasks]=useState<SharedTask[]>([]);
  const [splits,setSplits]=useState<ExpenseSplit[]>([]);
  const [comments,setComments]=useState<CollaborationComment[]>([]);
  const [taskTitle,setTaskTitle]=useState('');
  const [assignee,setAssignee]=useState('');
  const [comment,setComment]=useState('');
  const [mentionUid,setMentionUid]=useState('');
  const [splitDescription,setSplitDescription]=useState('');
  const [splitAmount,setSplitAmount]=useState('');
  const [splitUids,setSplitUids]=useState<string[]>([]);
  const [notes,setNotes]=useState('');
  const [decisions,setDecisions]=useState('');
  const [ritualCompleted,setRitualCompleted]=useState(false);
  const [weeklyStats,setWeeklyStats]=useState({pendingBills:0,pots:0});
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');

  function nameFor(memberUid:string){
    if(memberUid===uid) return l('Você','You','Tú');
    const member=members.find(item=>item.uid===memberUid);
    return member?.displayName||member?.email||l('Pessoa do Lar','Household member','Persona del Hogar');
  }

  async function refresh(silent=false){
    if(!silent) setLoading(true);
    setError('');
    try{
      const [collaboration,generalComments,ritual,home]=await Promise.all([
        loadCollaboration(householdId),
        loadComments(householdId,'decision','general'),
        loadWeeklyRitual(householdId,weekStart),
        loadHomeData(householdId)
      ]);
      setMembers(collaboration.members);
      setTasks(collaboration.tasks);
      setSplits(collaboration.splits);
      setComments(generalComments.comments);
      if(ritual.ritual){
        setNotes(ritual.ritual.notes||'');
        setDecisions(ritual.ritual.decisions||'');
        setRitualCompleted(Boolean(ritual.ritual.completed));
      }
      setWeeklyStats({
        pendingBills:home.commitments.filter(item=>item.status!=='cancelled'&&!item.paidThisMonth).length,
        pots:home.savingsPots.filter(item=>item.status==='active').length
      });
      if(splitUids.length===0&&collaboration.members.length>=2){
        setSplitUids(collaboration.members.slice(0,2).map(item=>item.uid));
      }
    }catch{
      setError(l('Não conseguimos sincronizar a Central do Lar agora.','We could not sync the Household Center right now.','No pudimos sincronizar la Central del Hogar ahora.'));
    }finally{
      if(!silent) setLoading(false);
    }
  }

  useEffect(()=>{void refresh();},[householdId,weekStart]);
  useHouseholdRevisionRefresh(householdId,()=>refresh(true),25_000,['household','activity','movements','pots']);

  async function addTask(){
    if(!canContribute||working||taskTitle.trim().length<2) return;
    setWorking(true);
    try{
      await createSharedTask({householdId,title:taskTitle.trim(),assigneeUid:assignee||null,entityKind:'decision'});
      setTaskTitle('');setAssignee('');await refresh(true);
    }catch{setError(l('Não conseguimos criar a pendência.','We could not create the task.','No pudimos crear la pendiente.'));}
    finally{setWorking(false);}
  }

  async function toggleTask(task:SharedTask){
    if(!canContribute||working) return;
    setWorking(true);
    try{await updateSharedTask(householdId,task.id,task.status==='open'?'done':'open');await refresh(true);}
    catch{setError(l('Não conseguimos atualizar a pendência.','We could not update the task.','No pudimos actualizar la pendiente.'));}
    finally{setWorking(false);}
  }

  async function addComment(){
    if(!canContribute||working||!comment.trim()) return;
    setWorking(true);
    try{
      await createComment({householdId,entityKind:'decision',entityId:'general',body:comment.trim(),mentionUids:mentionUid?[mentionUid]:[]});
      setComment('');setMentionUid('');await refresh(true);
    }catch{setError(l('Não conseguimos enviar o comentário.','We could not send the comment.','No pudimos enviar el comentario.'));}
    finally{setWorking(false);}
  }

  async function addSplit(){
    if(!canContribute||working||splitDescription.trim().length<2||splitUids.length<2) return;
    const totalMinor=parseMoneyInputToMinor(splitAmount,locale);
    if(totalMinor===null||totalMinor<=0) return;
    setWorking(true);
    try{
      await createExpenseSplit({householdId,description:splitDescription.trim(),totalMinor,shares:equalShares(totalMinor,splitUids)});
      setSplitDescription('');setSplitAmount('');await refresh(true);
    }catch{setError(l('Não conseguimos criar a divisão.','We could not create the split.','No pudimos crear la división.'));}
    finally{setWorking(false);}
  }

  async function settle(split:ExpenseSplit){
    if(!canContribute||working) return;
    setWorking(true);
    try{await settleExpenseSplit(householdId,split.id);await refresh(true);}
    catch{setError(l('Não conseguimos concluir o acerto.','We could not settle this split.','No pudimos concluir este ajuste.'));}
    finally{setWorking(false);}
  }

  async function saveRitual(completed:boolean){
    if(!canContribute||working) return;
    setWorking(true);
    try{
      const result=await saveWeeklyRitual({householdId,weekStart,notes,decisions,completed});
      setRitualCompleted(result.ritual.completed);
    }catch{setError(l('Não conseguimos salvar o encontro desta semana.','We could not save this week’s check-in.','No pudimos guardar el encuentro de esta semana.'));}
    finally{setWorking(false);}
  }

  const openTasks=tasks.filter(item=>item.status==='open');
  const doneTasks=tasks.filter(item=>item.status==='done').slice(0,8);
  const openSplits=splits.filter(item=>item.status==='open');

  return <AppShell className="together-shell" subtitle={l('Central do Lar','Household Center','Central del Hogar')} canContribute={canContribute} headerActions={<Link className="text-link" href="/household">{l('Acessos','Access','Accesos')}</Link>}>
    <section className="together-hero">
      <span>{l('CASAL E FAMÍLIA','COUPLE & FAMILY','PAREJA Y FAMILIA')}</span>
      <h1>{l('Combinar sem invadir.','Coordinate without intruding.','Coordinar sin invadir.')}</h1>
      <p>{l('Aqui entram apenas decisões e itens compartilhados do Lar. Seus registros Pessoais continuam fora desta central.','Only shared Household decisions and items appear here. Your private Personal records stay outside this center.','Aquí solo aparecen decisiones y elementos compartidos del Hogar. Tus registros Personales siguen fuera de esta central.')}</p>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}
    {loading?<div className="together-loading" role="status"/>:<>
      <section className="together-overview">
        <div><span>{l('Pendências','Open tasks','Pendientes')}</span><strong>{openTasks.length}</strong></div>
        <div><span>{l('Contas abertas','Open bills','Cuentas abiertas')}</span><strong>{weeklyStats.pendingBills}</strong></div>
        <div><span>{l('Cofrinhos ativos','Active pots','Alcancías activas')}</span><strong>{weeklyStats.pots}</strong></div>
        <div><span>{l('Acertos','Settlements','Ajustes')}</span><strong>{openSplits.length}</strong></div>
      </section>

      <div className="together-grid">
        <section className="together-panel">
          <div className="section-title"><div><h2>{l('Pendências compartilhadas','Shared tasks','Pendientes compartidas')}</h2><span>{l('o mesmo estado para todos','the same state for everyone','el mismo estado para todos')}</span></div></div>
          {canContribute&&<div className="together-inline-form"><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} maxLength={140} placeholder={l('Ex.: conferir a fatura de internet','E.g. review internet bill','Ej.: revisar la factura de internet')}/><select aria-label={l('Responsável pela pendência','Task owner','Responsable de la pendiente')} value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">{l('Sem responsável','Unassigned','Sin responsable')}</option>{members.map(member=><option key={member.uid} value={member.uid}>{nameFor(member.uid)}</option>)}</select><button disabled={working||taskTitle.trim().length<2} onClick={()=>void addTask()}>{l('Adicionar','Add','Agregar')}</button></div>}
          <div className="shared-task-list">
            {openTasks.map(task=><article key={task.id}><button type="button" disabled={!canContribute||working} onClick={()=>void toggleTask(task)}>○</button><div><strong>{task.title}</strong><small>{task.assigneeUid?l('Responsável','Owner','Responsable')+': '+nameFor(task.assigneeUid):l('Qualquer pessoa do Lar','Anyone in the Household','Cualquier persona del Hogar')} · {l('criado por','created by','creado por')} {nameFor(task.createdBy)}</small></div></article>)}
            {openTasks.length===0&&<p className="quiet-copy">{l('Nenhuma pendência compartilhada agora.','No shared tasks right now.','No hay pendientes compartidas ahora.')}</p>}
            {doneTasks.length>0&&<details><summary>{l('Concluídas recentemente','Recently completed','Completadas recientemente')}</summary>{doneTasks.map(task=><article className="done" key={task.id}><button type="button" disabled={!canContribute||working} onClick={()=>void toggleTask(task)}>✓</button><div><strong>{task.title}</strong><small>{nameFor(task.createdBy)}</small></div></article>)}</details>}
          </div>
        </section>

        <section className="together-panel">
          <div className="section-title"><div><h2>{l('Conversa do Lar','Household conversation','Conversación del Hogar')}</h2><span>{l('decisões com autoria','decisions with authorship','decisiones con autoría')}</span></div></div>
          <div className="comment-list">{comments.slice(-12).map(item=><article key={item.id}><div className="member-avatar">{nameFor(item.createdBy).slice(0,1).toUpperCase()}</div><div><strong>{nameFor(item.createdBy)}</strong><p>{item.body}</p>{item.mentionUids.length>0&&<small>{item.mentionUids.map(nameFor).join(', ')}</small>}</div></article>)}</div>
          {canContribute&&<div className="comment-composer"><textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={800} rows={3} placeholder={l('Registre uma decisão, dúvida ou combinado…','Record a decision, question, or agreement…','Registra una decisión, duda o acuerdo…')}/><div><select aria-label={l('Mencionar pessoa do Lar','Mention Household member','Mencionar persona del Hogar')} value={mentionUid} onChange={e=>setMentionUid(e.target.value)}><option value="">{l('Sem menção','No mention','Sin mención')}</option>{members.filter(item=>item.uid!==uid).map(member=><option key={member.uid} value={member.uid}>{nameFor(member.uid)}</option>)}</select><button disabled={working||!comment.trim()} onClick={()=>void addComment()}>{l('Enviar','Send','Enviar')}</button></div></div>}
        </section>
      </div>

      <LinkedConversationPanel householdId={householdId} uid={uid} members={members} canContribute={canContribute}/>

      <div className="together-grid">
        <section className="together-panel split-panel">
          <div className="section-title"><div><h2>{l('Dividir e acertar','Split & settle','Dividir y ajustar')}</h2><span>{l('opcional e sem criar dinheiro novo','optional and without inventing money','opcional y sin inventar dinero')}</span></div></div>
          {canContribute&&<div className="split-form"><input value={splitDescription} onChange={e=>setSplitDescription(e.target.value)} maxLength={140} placeholder={l('Ex.: presente da família','E.g. family gift','Ej.: regalo familiar')}/><input inputMode="decimal" value={splitAmount} onChange={e=>setSplitAmount(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/><div className="split-members">{members.map(member=><label key={member.uid}><input type="checkbox" checked={splitUids.includes(member.uid)} onChange={e=>setSplitUids(current=>e.target.checked?[...new Set([...current,member.uid])]:current.filter(id=>id!==member.uid))}/><span>{nameFor(member.uid)}</span></label>)}</div><button disabled={working||splitUids.length<2||!splitDescription.trim()||!splitAmount} onClick={()=>void addSplit()}>{l('Criar divisão igual','Create equal split','Crear división igual')}</button></div>}
          <div className="split-list">{openSplits.map(split=><article key={split.id}><div><strong>{split.description}</strong><span>{formatMoney(split.totalMinor)}</span><small>{split.shares.map(share=>nameFor(share.uid)+' '+formatMoney(share.amountMinor)).join(' · ')}</small></div>{canContribute&&<button disabled={working} onClick={()=>void settle(split)}>{l('Marcar acertado','Mark settled','Marcar ajustado')}</button>}</article>)}</div>
        </section>

        <section className="together-panel ritual-panel">
          <div className="section-title"><div><h2>{l('5 minutos da semana','5-minute weekly check-in','5 minutos de la semana')}</h2><span>{weekStart}</span></div>{ritualCompleted&&<b>{l('Concluído','Completed','Completado')}</b>}</div>
          <ol>
            <li>{openTasks.length} {l('pendência(s) compartilhada(s)','shared task(s)','pendiente(s) compartida(s)')}</li>
            <li>{weeklyStats.pendingBills} {l('conta(s) ainda aberta(s)','bill(s) still open','cuenta(s) aún abierta(s)')}</li>
            <li>{weeklyStats.pots} {l('meta(s) para lembrar','goal(s) to keep in mind','meta(s) para recordar')}</li>
            <li>{openSplits.length} {l('acerto(s) pendente(s)','settlement(s) open','ajuste(s) pendiente(s)')}</li>
          </ol>
          <label><span>{l('O que precisamos conversar?','What should we discuss?','¿Qué necesitamos conversar?')}</span><textarea disabled={!canContribute} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1200} rows={3}/></label>
          <label><span>{l('O que decidimos?','What did we decide?','¿Qué decidimos?')}</span><textarea disabled={!canContribute} value={decisions} onChange={e=>setDecisions(e.target.value)} maxLength={1200} rows={3}/></label>
          {canContribute&&<div className="ritual-actions"><button disabled={working} onClick={()=>void saveRitual(false)}>{l('Salvar para continuar','Save for later','Guardar para continuar')}</button><button className="primary-button" disabled={working} onClick={()=>void saveRitual(true)}>{l('Concluir semana','Complete week','Completar semana')}</button></div>}
        </section>
      </div>
    </>}
  </AppShell>;
}
