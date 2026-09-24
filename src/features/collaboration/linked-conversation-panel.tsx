'use client';

import { useEffect, useMemo, useState } from 'react';
import { createComment, loadComments, type CollaborationComment, type CollaborationMember } from '@/src/lib/repositories/collaboration';
import { loadHomeData } from '@/src/lib/repositories/home';
import { useI18n } from '@/src/i18n/locale-provider';

type Entity={kind:'commitment'|'pot';id:string;label:string};

export function LinkedConversationPanel({householdId,uid,members,canContribute}:{householdId:string;uid:string;members:CollaborationMember[];canContribute:boolean}){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [entities,setEntities]=useState<Entity[]>([]);
  const [selectedKey,setSelectedKey]=useState('');
  const [comments,setComments]=useState<CollaborationComment[]>([]);
  const [body,setBody]=useState('');
  const [mentionUid,setMentionUid]=useState('');
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const selected=useMemo(()=>entities.find(item=>`${item.kind}:${item.id}`===selectedKey)||null,[entities,selectedKey]);
  const nameFor=(memberUid:string)=>{
    if(memberUid===uid) return l('Você','You','Tú');
    const member=members.find(item=>item.uid===memberUid);
    return member?.displayName||member?.email||l('Pessoa do Lar','Household member','Persona del Hogar');
  };

  useEffect(()=>{
    let active=true;setLoading(true);
    void loadHomeData(householdId).then(home=>{
      if(!active) return;
      const next:Entity[]=[
        ...home.commitments.filter(item=>item.scope!=='personal'&&item.status!=='cancelled').slice(0,30).map(item=>({kind:'commitment' as const,id:item.id,label:l('Conta: ','Bill: ','Cuenta: ')+item.description})),
        ...home.savingsPots.filter(item=>item.scope!=='personal'&&item.status==='active').slice(0,30).map(item=>({kind:'pot' as const,id:item.id,label:l('Meta: ','Goal: ','Meta: ')+item.name}))
      ];
      setEntities(next);setSelectedKey(current=>current||(next[0]?`${next[0].kind}:${next[0].id}`:''));setError('');
    }).catch(()=>active&&setError(l('Não conseguimos listar contas e metas compartilhadas.','We could not list shared bills and goals.','No pudimos listar cuentas y metas compartidas.'))).finally(()=>active&&setLoading(false));
    return ()=>{active=false;};
  },[householdId]);

  useEffect(()=>{
    if(!selected){setComments([]);return;}
    let active=true;setLoading(true);
    void loadComments(householdId,selected.kind,selected.id).then(result=>{if(active){setComments(result.comments);setError('');}})
      .catch(()=>active&&setError(l('Não conseguimos abrir esta conversa.','We could not open this conversation.','No pudimos abrir esta conversación.'))).finally(()=>active&&setLoading(false));
    return ()=>{active=false;};
  },[householdId,selected?.kind,selected?.id]);

  async function send(){
    if(!selected||!canContribute||working||!body.trim()) return;
    setWorking(true);setError('');
    try{
      const result=await createComment({householdId,entityKind:selected.kind,entityId:selected.id,body:body.trim(),mentionUids:mentionUid?[mentionUid]:[]});
      setComments(items=>[...items,result.comment]);setBody('');setMentionUid('');
    }catch{setError(l('Não conseguimos enviar este comentário.','We could not send this comment.','No pudimos enviar este comentario.'));}
    finally{setWorking(false);}
  }

  return <section className="together-panel linked-conversation-panel">
    <div className="section-title"><div><h2>{l('Conversas ligadas às finanças','Conversations linked to finances','Conversaciones vinculadas a las finanzas')}</h2><span>{l('contas e metas compartilhadas, com autoria','shared bills and goals, with authorship','cuentas y metas compartidas, con autoría')}</span></div></div>
    {entities.length>0?<label className="linked-entity-select"><span>{l('Conversar sobre','Discuss','Conversar sobre')}</span><select value={selectedKey} onChange={event=>setSelectedKey(event.target.value)}>{entities.map(item=><option key={item.kind+':'+item.id} value={item.kind+':'+item.id}>{item.label}</option>)}</select></label>:!loading&&<p className="quiet-copy">{l('Quando houver uma conta ou meta do Lar, a conversa pode ficar ligada a ela aqui.','When the Household has a bill or goal, its conversation can be linked here.','Cuando el Hogar tenga una cuenta o meta, la conversación podrá vincularse aquí.')}</p>}
    {loading&&<div className="linked-conversation-loading" role="status" aria-label={l('Carregando conversa','Loading conversation','Cargando conversación')}/>}
    {!loading&&selected&&<div className="comment-list linked-comment-list">{comments.length?comments.slice(-12).map(item=><article key={item.id}><div className="member-avatar">{nameFor(item.createdBy).slice(0,1).toUpperCase()}</div><div><strong>{nameFor(item.createdBy)}</strong><p>{item.body}</p>{item.mentionUids.length>0&&<small>{item.mentionUids.map(nameFor).join(', ')}</small>}</div></article>):<p className="quiet-copy">{l('Nenhum comentário ainda.','No comments yet.','Aún no hay comentarios.')}</p>}</div>}
    {selected&&canContribute&&<div className="comment-composer linked-comment-composer"><textarea aria-label={l('Comentário sobre a conta ou meta','Comment about the bill or goal','Comentario sobre la cuenta o meta')} value={body} onChange={event=>setBody(event.target.value)} rows={3} maxLength={800} placeholder={l('Ex.: podemos pagar amanhã?','E.g. can we pay this tomorrow?','Ej.: ¿podemos pagar esto mañana?')}/><div><select aria-label={l('Mencionar pessoa nesta conversa','Mention a person in this conversation','Mencionar persona en esta conversación')} value={mentionUid} onChange={event=>setMentionUid(event.target.value)}><option value="">{l('Sem menção','No mention','Sin mención')}</option>{members.filter(item=>item.uid!==uid).map(member=><option key={member.uid} value={member.uid}>{nameFor(member.uid)}</option>)}</select><button disabled={working||!body.trim()} onClick={()=>void send()}>{working?l('Enviando…','Sending…','Enviando…'):l('Enviar','Send','Enviar')}</button></div></div>}
    {error&&<p className="error-copy" role="alert">{error}</p>}
    <small className="linked-privacy-note">{l('Itens Pessoais nunca aparecem nesta lista.','Personal items never appear in this list.','Los elementos Personales nunca aparecen en esta lista.')}</small>
  </section>;
}
