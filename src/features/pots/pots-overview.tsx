'use client';

import Link from 'next/link';
import type { SavingsPotGroup } from '@/src/core/savings-pots';
import type { FinancialView } from '@/src/features/privacy/scope-view-switch';
import { ScopeViewSwitch } from '@/src/features/privacy/scope-view-switch';
import { SavingsPotCover } from '@/src/features/pots/pot-cover';
import { savingsPotGoalPace } from '@/src/core/savings-pot-goal';
import { savingsPotAutomationLabel } from '@/src/features/pots/pot-copy';
import type { HomeSavingsPot } from '@/src/lib/repositories/home';
import { useI18n } from '@/src/i18n/locale-provider';

export function PotsOverview({
  householdId,canContribute,view,onViewChange,loading,groups,total,institutionCount,reachedCount,goalsTotal,remainingTotal,error,notice,onOpenNew,onOpenDetail,onOpenEdit
}:{
  householdId:string;
  canContribute:boolean;
  view:FinancialView;
  onViewChange:(view:FinancialView)=>void;
  loading:boolean;
  groups:SavingsPotGroup<HomeSavingsPot>[];
  total:number;
  institutionCount:number;
  reachedCount:number;
  goalsTotal:number;
  remainingTotal:number;
  error:string;
  notice:string;
  onOpenNew:()=>void;
  onOpenDetail:(pot:HomeSavingsPot)=>void|Promise<void>;
  onOpenEdit:(pot:HomeSavingsPot)=>void;
}){
  const {locale,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  return <>
    <ScopeViewSwitch value={view} onChange={onViewChange}/>
    <section className="area-hero accounts-hero pots-hero">
      <span>{l('Dinheiro com propósito','Money with a purpose','Dinero con propósito')}</span>
      <h1>{loading?l('Organizando seus cofrinhos…','Organizing your savings pots…','Organizando tus alcancías…'):groups.length?formatMoney(total):l('Crie uma meta. Ou mande um print.','Create a goal. Or send a screenshot.','Crea una meta. O envía una captura.')}</h1>
      <p>{groups.length
        ? l(`${groups.length} objetivo${groups.length===1?'':'s'} · ${institutionCount} ${institutionCount===1?'origem':'origens'} · ${reachedCount} concluído${reachedCount===1?'':'s'}.`,`${groups.length} goal${groups.length===1?'':'s'} · ${institutionCount} source${institutionCount===1?'':'s'} · ${reachedCount} reached.`,`${groups.length} objetivo${groups.length===1?'':'s'} · ${institutionCount} origen${institutionCount===1?'':'es'} · ${reachedCount} cumplido${reachedCount===1?'':'s'}.`)
        : l('Você pode criar um cofrinho completo manualmente ou mandar uma tela do banco para o NestBalance reconhecer vários de uma vez.','Create a complete savings pot manually or send a bank screenshot so NestBalance can recognize several at once.','Puedes crear una alcancía completa manualmente o enviar una captura del banco para que NestBalance reconozca varias de una vez.')}</p>
      {groups.length>0&&goalsTotal>0&&<div className="pots-hero-facts">
        <div><span>{l('Ainda falta nas metas','Still needed for goals','Aún falta en las metas')}</span><strong>{formatMoney(remainingTotal)}</strong></div>
        <div><span>{l('Metas definidas','Goals defined','Metas definidas')}</span><strong>{groups.filter(item=>item.goalMinor).length}</strong></div>
      </div>}
    </section>
    {error&&<p className="error-copy" role="alert">{error}</p>}
    {notice&&<p className="success-copy" role="status">{notice}</p>}
    {canContribute&&<section>
      <div className="section-title"><div><span className="section-kicker">{l('DO SEU JEITO','YOUR WAY','A TU MANERA')}</span><h2>{l('Começar leva poucos segundos','Get started in seconds','Empieza en segundos')}</h2></div></div>
      <div className="account-balance-grid pots-quick-grid">
        <Link href="/add?return=/pots" className="account-balance-tile pots-action-tile pots-import-action">
          <span>{l('Já tem no banco','Already in your bank','Ya está en tu banco')}</span><h3>{l('Importar por print','Import from screenshot','Importar por captura')}</h3><strong>{l('Vários de uma vez','Several at once','Varios a la vez')}</strong>
          <small>{l('Reconhecemos nome, saldo, meta, prazo quando aparecer e atualizamos o que já existe.','We recognize name, balance, goal, deadline when visible, and update what already exists.','Reconocemos nombre, saldo, meta, plazo cuando aparece y actualizamos lo que ya existe.')}</small>
        </Link>
        <button type="button" className="account-balance-tile pots-action-tile" onClick={onOpenNew}>
          <span>{l('Quer criar aqui','Create it here','Quieres crearla aquí')}</span><h3>{l('Novo cofrinho','New savings pot','Nueva alcancía')}</h3><strong>{l('Foto + meta + prazo','Photo + goal + deadline','Foto + meta + plazo')}</strong>
          <small>{l('Dê nome ao objetivo, coloque uma foto e acompanhe cada reserva até chegar lá.','Name the goal, add a photo, and track every contribution until you get there.','Nombra el objetivo, agrega una foto y acompaña cada aporte hasta llegar.')}</small>
        </button>
      </div>
    </section>}
    <section className="savings-pots-section">
      <div className="section-title"><div><h2>{l('Seus cofrinhos','Your savings pots','Tus alcancías')}</h2><span>{l('o mesmo objetivo em bancos diferentes aparece junto','the same goal across different banks appears together','el mismo objetivo en bancos distintos aparece junto')}</span></div></div>
      {loading
        ? <div className="savings-pot-grid savings-pot-premium-grid">{[0,1,2].map(i=><div className="savings-pot-card skeleton-line" key={i}/>)}</div>
        : groups.length===0
          ? <div className="empty-state empty-state-action"><div><h3>{l('Seu primeiro cofrinho pode nascer de um print ou do zero.','Your first savings pot can start from a screenshot or from scratch.','Tu primera alcancía puede nacer de una captura o desde cero.')}</h3><p>{l('Se já existe no banco, importe. Se é uma nova meta, crie aqui com nome, foto, valor-alvo e prazo.','If it already exists at your bank, import it. If it is a new goal, create it here with a name, photo, target amount, and deadline.','Si ya existe en tu banco, impórtala. Si es una meta nueva, créala aquí con nombre, foto, valor objetivo y plazo.')}</p></div>{canContribute&&<button className="primary-button" type="button" onClick={onOpenNew}>{l('Criar meu primeiro cofrinho','Create my first savings pot','Crear mi primera alcancía')}</button>}</div>
          : <div className="savings-pot-grid savings-pot-premium-grid">{groups.map(group=>{
              const pace=savingsPotGoalPace(group.balanceMinor,group.goalMinor,group.targetDate);
              const coverSource=group.coverSourceId?group.sources.find(item=>item.id===group.coverSourceId)||null:null;
              return <article className="savings-pot-card savings-pot-premium-card" key={group.key}>
                <SavingsPotCover householdId={householdId} potId={coverSource?.id||group.sources[0].id} name={group.name} hasCover={Boolean(coverSource?.hasCover)} coverVersion={coverSource?.coverVersion||null}/>
                <div className="savings-pot-card-body">
                  <div className="savings-pot-card-kicker"><span>{group.sources.length===1?group.sources[0].institutionName||l('Criado no NestBalance','Created in NestBalance','Creado en NestBalance'):l(`${group.sources.length} origens`,`${group.sources.length} sources`,`${group.sources.length} orígenes`)}</span>{group.scope==='personal'&&<em className="personal-pill">{l('Só eu','Only me','Solo yo')}</em>}</div>
                  <h3>{group.name}</h3><strong>{formatMoney(group.balanceMinor)}</strong>
                  {group.goalMinor&&group.goalMinor>0
                    ? <><div className="savings-pot-progress-copy"><span>{l('Meta','Goal','Meta')} {formatMoney(group.goalMinor)}</span><b>{Math.round((group.progress||0)*100)}%</b></div><progress max={group.goalMinor} value={Math.min(group.balanceMinor,group.goalMinor)} aria-label={l('Progresso da meta','Goal progress','Progreso de la meta')}/><small>{pace.reached?l('Meta alcançada.','Goal reached.','Meta alcanzada.'):group.targetDate&&pace.daysRemaining!==null&&pace.daysRemaining>=0?l(`Faltam ${formatMoney(pace.remainingMinor)} · cerca de ${formatMoney(pace.suggestedMonthlyMinor||0)}/mês até ${formatDate(new Date(group.targetDate+'T12:00:00'),{day:'2-digit',month:'short'})}.`,`${formatMoney(pace.remainingMinor)} left · about ${formatMoney(pace.suggestedMonthlyMinor||0)}/month until ${formatDate(new Date(group.targetDate+'T12:00:00'),{day:'2-digit',month:'short'})}.`,`Faltan ${formatMoney(pace.remainingMinor)} · cerca de ${formatMoney(pace.suggestedMonthlyMinor||0)}/mes hasta ${formatDate(new Date(group.targetDate+'T12:00:00'),{day:'2-digit',month:'short'})}.`):l(`Faltam ${formatMoney(pace.remainingMinor)}.`,`${formatMoney(pace.remainingMinor)} left.`,`Faltan ${formatMoney(pace.remainingMinor)}.`)}</small></>
                    : <small>{l('Defina uma meta para acompanhar o progresso.','Set a goal to track progress.','Define una meta para seguir el progreso.')}</small>}
                  {group.automation?.enabled&&<div className="savings-pot-automation-pill">{savingsPotAutomationLabel(group.automation,locale)}</div>}
                  {group.goalConflict&&<small className="pot-warning">{l('As origens têm metas diferentes; mostramos a maior.','Sources have different goals; we show the highest.','Los orígenes tienen metas distintas; mostramos la mayor.')}</small>}
                  <div className="savings-pot-card-actions">{group.sources.length===1
                    ? <><button type="button" onClick={()=>void onOpenDetail(group.sources[0])}>{l('Abrir','Open','Abrir')}</button>{canContribute&&<button type="button" className="secondary" onClick={()=>onOpenEdit(group.sources[0])}>{l('Editar','Edit','Editar')}</button>}</>
                    : group.sources.map(source=><button type="button" key={source.id} onClick={()=>void onOpenDetail(source)}>{source.institutionName||l('Manual','Manual','Manual')} · {formatMoney(source.balanceMinor)}</button>)}</div>
                </div>
              </article>;
            })}</div>}
    </section>
    <section className="pots-trust-note"><div><span className="section-kicker">{l('IMPORTANTE','IMPORTANT','IMPORTANTE')}</span><h3>{l('Organizar não é movimentar seu banco.','Organizing is not moving money at your bank.','Organizar no es mover dinero en tu banco.')}</h3></div><p>{l('Reservar ou retirar aqui atualiza sua organização no NestBalance. Em cofrinhos importados, o próximo print pode sincronizar o saldo real. Em nenhum caso tratamos uma reserva entre recursos seus como nova despesa ou nova renda.','Saving or withdrawing here updates your NestBalance organization. For imported savings pots, the next screenshot can sync the real balance. We never treat a transfer between your own funds as new spending or new income.','Reservar o retirar aquí actualiza tu organización en NestBalance. En alcancías importadas, la próxima captura puede sincronizar el saldo real. Nunca tratamos un movimiento entre tus propios fondos como un gasto o ingreso nuevo.')}</p></section>
  </>;
}
