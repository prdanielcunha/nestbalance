'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { canHouseholdRole, type HouseholdRole } from '@/src/core/household';
import { deriveCashView } from '@/src/core/cash-view';
import { deriveFinancialAnomalies } from '@/src/core/insights';
import {
  buildMonthlyCloseChecklist,
  deriveExplainableInsights,
  simulateFinancialScenario,
  type ExplainableInsight,
  type ScenarioResult
} from '@/src/core/financial-intelligence';
import {
  acceptsInsightPreference,
  DEFAULT_INTELLIGENCE_PREFERENCES,
  type IntelligencePreferences
} from '@/src/core/intelligence-preferences';
import { loadHomeData } from '@/src/lib/repositories/home';
import {
  completeMonthlyClose,
  deletePlanningScenario,
  loadMonthlyClose,
  loadPlanningScenarios,
  saveIntelligencePreferences,
  savePlanningScenario,
  type SavedPlanningScenario
} from '@/src/lib/repositories/planning';
import { useI18n } from '@/src/i18n/locale-provider';

type ScenarioKind=SavedPlanningScenario['kind'];

function insightHref(insight:ExplainableInsight){
  if(insight.action==='review_movements') return '/movements';
  if(insight.action==='review_commitment') return '/';
  if(insight.action==='open_pots') return '/pots';
  return '/assistant';
}

export function PlanningLab({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {locale,intlLocale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const canManage=canHouseholdRole(role,'manage_finance');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [home,setHome]=useState<Awaited<ReturnType<typeof loadHomeData>>|null>(null);
  const [scenarios,setScenarios]=useState<SavedPlanningScenario[]>([]);
  const [closeStatus,setCloseStatus]=useState<null|{periodKey:string;status:string}>(null);
  const [scenarioName,setScenarioName]=useState('');
  const [scenarioAmount,setScenarioAmount]=useState('');
  const [scenarioKind,setScenarioKind]=useState<ScenarioKind>('purchase');
  const [scenarioScope,setScenarioScope]=useState<'household'|'personal'>('household');
  const [scenarioSaving,setScenarioSaving]=useState(false);
  const [prefs,setPrefs]=useState<IntelligencePreferences>(DEFAULT_INTELLIGENCE_PREFERENCES);
  const [prefsSaving,setPrefsSaving]=useState(false);
  const [closing,setClosing]=useState(false);

  const periodKey=useMemo(()=>{
    const now=new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  },[]);

  async function refresh(){
    setLoading(true);
    setError('');
    try{
      const [homeData,scenarioData,closeData]=await Promise.all([
        loadHomeData(householdId),
        loadPlanningScenarios(householdId),
        loadMonthlyClose(householdId,periodKey)
      ]);
      setHome(homeData);
      setScenarios(Array.isArray(scenarioData.scenarios)?scenarioData.scenarios:[]);
      setCloseStatus(closeData.close?{periodKey:closeData.close.periodKey,status:closeData.close.status}:null);
      setPrefs(homeData.intelligencePreferences||DEFAULT_INTELLIGENCE_PREFERENCES);
    }catch{
      setError(l('Não conseguimos carregar o planejamento agora.','We could not load planning right now.','No pudimos cargar la planificación ahora.'));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void refresh();},[householdId,periodKey]);

  const availableMinor=useMemo(()=>home?.accounts
    .filter(item=>item.connectedProductType!=='investment')
    .reduce((sum,item)=>sum+item.balanceMinor,0)||0,[home]);
  const cashView=useMemo(()=>deriveCashView({
    transactions:home?.transactions||[],
    commitments:(home?.commitments||[]).filter(item=>!item.paidThisMonth),
    invoices:home?.invoiceImports||[]
  }),[home]);
  const projectedRemainderMinor=availableMinor-cashView.futureCommitmentsMinor;

  const insights=useMemo(()=>{
    if(!home) return [];
    return deriveExplainableInsights({
      transactions:home.transactions,
      commitments:home.commitments,
      pots:home.savingsPots,
      projectedRemainderMinor,
      now:new Date()
    }).filter(item=>acceptsInsightPreference(prefs,item));
  },[home,prefs,projectedRemainderMinor]);

  const anomalies=useMemo(()=>home?deriveFinancialAnomalies(home.transactions,new Date()):[],[home]);
  const closeChecklist=useMemo(()=>{
    if(!home) return [];
    const uncertain=(home.invoiceImports||[]).filter(item=>item.status==='partial').length;
    const unpaid=(home.commitments||[]).filter(item=>item.status!=='cancelled'&&!item.paidThisMonth).length;
    const possibleDuplicates=anomalies.filter(item=>item.type==='possible_duplicate').length;
    return buildMonthlyCloseChecklist({
      accountsCount:home.accounts.length,
      uncertainItems:uncertain,
      unpaidCommitments:unpaid,
      missingDocuments:uncertain,
      possibleDuplicates
    });
  },[home,anomalies]);
  const canClose=closeChecklist.length>0&&closeChecklist.every(item=>item.status==='done');

  const liveScenario=useMemo<ScenarioResult|null>(()=>{
    const amount=parseMoneyInputToMinor(scenarioAmount,locale);
    if(amount===null) return null;
    return simulateFinancialScenario({
      availableMinor,
      committedMinor:cashView.futureCommitmentsMinor,
      amountMinor:amount,
      kind:scenarioKind
    });
  },[scenarioAmount,scenarioKind,availableMinor,cashView.futureCommitmentsMinor,locale]);

  function insightTitle(item:ExplainableInsight){
    if(item.type==='possible_duplicate') return l('Pode haver uma cobrança repetida','There may be a duplicate charge','Puede haber un cobro repetido');
    if(item.type==='amount_increase') return l('Este valor subiu bastante','This amount increased sharply','Este valor subió bastante');
    if(item.type==='spending_change') return l('O mês ficou mais caro','This month became more expensive','Este mes se volvió más caro');
    if(item.type==='subscription') return l('Assinatura recorrente detectada','Recurring subscription detected','Suscripción recurrente detectada');
    if(item.type==='due_bill') return l('Conta exigindo atenção','Bill needs attention','Cuenta que requiere atención');
    return l('Seu Cofrinho pode receber um reforço','Your savings pot could get a boost','Tu alcancía puede recibir un refuerzo');
  }

  function insightPremise(item:ExplainableInsight){
    const map:Record<string,[string,string,string]>={
      same_normalized_description_amount_and_day:[
        'Mesma descrição normalizada, mesmo valor e mesma data.',
        'Same normalized description, amount, and date.',
        'Misma descripción normalizada, mismo valor y misma fecha.'
      ],
      current_amount_at_least_35_percent_and_50_brl_above_recent_median:[
        'Valor atual ficou ao menos 35% e R$ 50 acima da mediana recente.',
        'Current amount is at least 35% and R$50 above the recent median.',
        'El valor actual quedó al menos 35% y R$50 por encima de la mediana reciente.'
      ],
      current_month_compared_with_previous_month_known_expenses:[
        'Comparação entre despesas conhecidas deste mês e do mês anterior.',
        'Comparison between known expenses this month and last month.',
        'Comparación entre gastos conocidos de este mes y del mes anterior.'
      ],
      stable_expense_observed_in_at_least_three_months:[
        'Despesa semelhante apareceu de forma estável em pelo menos três meses.',
        'A similar expense appeared steadily in at least three months.',
        'Un gasto similar apareció de forma estable durante al menos tres meses.'
      ],
      known_bill_due_day_already_passed:[
        'A data conhecida desta conta já passou e não há pagamento ligado.',
        'The known due day has passed and no payment is linked.',
        'La fecha conocida ya pasó y no hay pago vinculado.'
      ],
      known_bill_due_within_three_days:[
        'A conta vence em até três dias e ainda está pendente.',
        'The bill is due within three days and is still pending.',
        'La cuenta vence en hasta tres días y sigue pendiente.'
      ],
      weekly_pace_with_known_surplus:[
        'Usa o ritmo semanal da meta e limita a sugestão a 25% da sobra conhecida.',
        'Uses the goal weekly pace and caps the suggestion at 25% of known surplus.',
        'Usa el ritmo semanal de la meta y limita la sugerencia al 25% del excedente conocido.'
      ]
    };
    const value=map[item.premise];
    return value?l(...value):item.premise;
  }

  async function toggleSubject(key:keyof Pick<IntelligencePreferences,'duplicates'|'amountIncreases'|'spendingChanges'|'subscriptions'|'dueBills'|'potSuggestions'>){
    if(prefsSaving) return;
    const previous=prefs;
    const next={...prefs,[key]:!prefs[key]};
    setPrefs(next);
    setPrefsSaving(true);
    try{
      const result=await saveIntelligencePreferences(householdId,next);
      setPrefs(result.preferences);
    }catch{
      setPrefs(previous);
      setError(l('Não conseguimos salvar essa preferência.','We could not save that preference.','No pudimos guardar esa preferencia.'));
    }finally{
      setPrefsSaving(false);
    }
  }

  async function saveScenario(){
    const amountMinor=parseMoneyInputToMinor(scenarioAmount,locale);
    if(amountMinor===null||amountMinor<0||scenarioName.trim().length<2) return;
    setScenarioSaving(true);
    setError('');
    try{
      const result=await savePlanningScenario({
        householdId,
        name:scenarioName.trim(),
        kind:scenarioKind,
        amountMinor,
        scope:scenarioScope,
        availableMinor,
        committedMinor:cashView.futureCommitmentsMinor
      });
      setScenarios(items=>[result.scenario,...items]);
      setScenarioName('');
      setScenarioAmount('');
    }catch{
      setError(l('Não conseguimos salvar este cenário.','We could not save this scenario.','No pudimos guardar este escenario.'));
    }finally{
      setScenarioSaving(false);
    }
  }

  async function removeScenario(id:string){
    try{
      await deletePlanningScenario(householdId,id);
      setScenarios(items=>items.filter(item=>item.id!==id));
    }catch{
      setError(l('Só quem criou o cenário pode descartá-lo.','Only the creator can discard this scenario.','Solo quien creó el escenario puede descartarlo.'));
    }
  }

  async function closeMonth(){
    if(!home||!canManage||!canClose||closing) return;
    setClosing(true);
    setError('');
    try{
      const result=await completeMonthlyClose({
        householdId,
        periodKey,
        checklist:closeChecklist,
        summary:{
          availableMinor,
          committedMinor:cashView.futureCommitmentsMinor,
          projectedRemainderMinor,
          transactionCount:home.transactions.length
        }
      });
      setCloseStatus({periodKey:result.close.periodKey,status:result.close.status});
    }catch{
      setError(l('Ainda há exceções para resolver antes de fechar o mês.','There are still exceptions to resolve before closing the month.','Todavía hay excepciones por resolver antes de cerrar el mes.'));
    }finally{
      setClosing(false);
    }
  }

  if(loading) return <section className="planning-lab planning-loading" aria-label={l('Carregando planejamento','Loading planning','Cargando planificación')}/>;
  if(!home) return <section className="planning-lab"><p className="error-copy">{error}</p></section>;

  return <section className="planning-lab" aria-labelledby="planning-title">
    <div className="planning-head">
      <div>
        <span>{l('PLANEJAR E ENTENDER','PLAN & UNDERSTAND','PLANEAR Y ENTENDER')}</span>
        <h2 id="planning-title">{l('Decisões com evidência, não com chute','Decisions with evidence, not guesses','Decisiones con evidencia, no con suposiciones')}</h2>
        <p>{l('Insights são sinais para conferir. Simulações não alteram seus dados reais e não são aconselhamento financeiro definitivo.','Insights are signals to review. Simulations never change real data and are not definitive financial advice.','Los insights son señales para revisar. Las simulaciones no cambian tus datos reales ni son asesoramiento financiero definitivo.')}</p>
      </div>
      <div className="planning-summary">
        <span>{l('Sobra conhecida','Known remainder','Excedente conocido')}</span>
        <strong>{formatMoney(projectedRemainderMinor)}</strong>
        <small>{formatMoney(cashView.futureCommitmentsMinor)} {l('ainda comprometidos','still committed','todavía comprometidos')}</small>
      </div>
    </div>

    {error&&<p className="error-copy" role="alert">{error}</p>}

    <div className="planning-grid">
      <section className="planning-panel insight-panel">
        <div className="section-title"><div><h3>{l('Radar explicável','Explainable radar','Radar explicable')}</h3><span>{l('fonte, premissa, confiança e ação','source, premise, confidence and action','fuente, premisa, confianza y acción')}</span></div><small>{insights.length}</small></div>
        {insights.length===0
          ? <div className="empty-state compact"><h4>{l('Nada importante para destacar.','Nothing important to highlight.','Nada importante para destacar.')}</h4><p>{l('Quando surgir algo relevante, aparece aqui com o motivo.','When something relevant appears, it will show here with the reason.','Cuando aparezca algo relevante, se mostrará aquí con el motivo.')}</p></div>
          : <div className="insight-feed">{insights.map(item=><article className={`insight-card ${item.urgency}`} key={item.id}>
              <div className="insight-card-head"><span>{item.urgency==='critical'?l('Crítico','Critical','Crítico'):item.urgency==='high'?l('Alta prioridade','High priority','Alta prioridad'):l('Informativo','Informational','Informativo')}</span><b>{item.confidence==='high'?l('Confiança alta','High confidence','Confianza alta'):l('Confiança média','Medium confidence','Confianza media')}</b></div>
              <h4>{insightTitle(item)}</h4>
              {item.amountMinor!==null&&<strong>{formatMoney(item.amountMinor)}</strong>}
              <details><summary>{l('Por que estou vendo isso?','Why am I seeing this?','¿Por qué veo esto?')}</summary><p>{insightPremise(item)}</p><small>{item.sourceIds.length} {l('fonte(s) usada(s)','source(s) used','fuente(s) usada(s)')}</small></details>
              <div className="insight-actions"><Link href={insightHref(item)}>{l('Conferir','Review','Revisar')}</Link></div>
            </article>)}</div>}
      </section>

      <section className="planning-panel scenario-panel">
        <div className="section-title"><div><h3>{l('Simulador','Simulator','Simulador')}</h3><span>{l('teste sem mexer na realidade','test without changing reality','prueba sin cambiar la realidad')}</span></div></div>
        <div className="scenario-form">
          <label><span>{l('Cenário','Scenario','Escenario')}</span><select value={scenarioKind} onChange={e=>setScenarioKind(e.target.value as ScenarioKind)}>
            <option value="purchase">{l('Nova compra','New purchase','Nueva compra')}</option>
            <option value="income_drop">{l('Queda de renda','Income drop','Caída de ingresos')}</option>
            <option value="extra_income">{l('Renda extra','Extra income','Ingreso extra')}</option>
            <option value="debt_payment">{l('Antecipar pagamento','Extra debt payment','Anticipar pago')}</option>
          </select></label>
          <label><span>{l('Valor','Amount','Valor')}</span><input inputMode="decimal" value={scenarioAmount} onChange={e=>setScenarioAmount(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></label>
          <label><span>{l('Nome para salvar','Name to save','Nombre para guardar')}</span><input value={scenarioName} onChange={e=>setScenarioName(e.target.value)} maxLength={80} placeholder={l('Ex.: trocar de celular','E.g. replace phone','Ej.: cambiar de celular')}/></label>
          <label><span>{l('Visibilidade','Visibility','Visibilidad')}</span><select value={scenarioScope} onChange={e=>setScenarioScope(e.target.value as 'household'|'personal')}><option value="household">{l('Lar','Household','Hogar')}</option><option value="personal">{l('Só eu','Only me','Solo yo')}</option></select></label>
        </div>
        {liveScenario&&<div className="scenario-result"><span>{l('Se isso acontecer, a sobra conhecida iria para','If this happens, known remainder would become','Si esto sucede, el excedente conocido quedaría en')}</span><strong>{formatMoney(liveScenario.projectedRemainderMinor)}</strong><small>{liveScenario.deltaMinor>=0?'+':''}{formatMoney(liveScenario.deltaMinor)} {l('vs. cenário atual','vs current scenario','vs escenario actual')}</small></div>}
        <button className="primary-button" disabled={scenarioSaving||!liveScenario||scenarioName.trim().length<2} onClick={()=>void saveScenario()}>{scenarioSaving?l('Salvando…','Saving…','Guardando…'):l('Salvar cenário','Save scenario','Guardar escenario')}</button>
        {scenarios.length>0&&<div className="saved-scenarios">{scenarios.map(item=><article key={item.id}><div><span>{item.scope==='personal'?l('Só eu','Only me','Solo yo'):l('Lar','Household','Hogar')}</span><strong>{item.name}</strong><small>{formatMoney(item.result.projectedRemainderMinor)} · {formatMoney(item.amountMinor)}</small></div><button type="button" onClick={()=>void removeScenario(item.id)}>{l('Descartar','Discard','Descartar')}</button></article>)}</div>}
      </section>
    </div>

    <div className="planning-grid secondary">
      <section className="planning-panel close-panel">
        <div className="section-title"><div><h3>{l('Fechamento mensal','Monthly close','Cierre mensual')}</h3><span>{periodKey}</span></div>{closeStatus?.status==='closed'&&<b>{l('Fechado','Closed','Cerrado')}</b>}</div>
        <div className="close-checklist">{closeChecklist.map(item=><div className={item.status} key={item.key}><span aria-hidden="true">{item.status==='done'?'✓':'!'}</span><div><strong>{item.key==='accounts'?l('Contas cadastradas','Accounts present','Cuentas registradas'):item.key==='uncertain_items'?l('Itens em revisão','Items under review','Elementos en revisión'):item.key==='open_bills'?l('Contas pendentes','Open bills','Cuentas pendientes'):item.key==='documents'?l('Documentos/revisões pendentes','Pending documents/reviews','Documentos/revisiones pendientes'):l('Possíveis duplicidades','Possible duplicates','Posibles duplicados')}</strong><small>{item.status==='done'?l('Tudo certo','All clear','Todo bien'):`${item.count} ${l('para resolver','to resolve','por resolver')}`}</small></div></div>)}</div>
        {closeStatus?.status==='closed'
          ? <p className="notice-copy">{l('Este mês já tem um resumo confiável registrado.','This month already has a trusted summary recorded.','Este mes ya tiene un resumen confiable registrado.')}</p>
          : <button className="primary-button" disabled={!canManage||!canClose||closing} onClick={()=>void closeMonth()}>{closing?l('Fechando…','Closing…','Cerrando…'):canClose?l('Concluir fechamento','Complete close','Completar cierre'):l('Resolva as exceções acima','Resolve exceptions above','Resuelve las excepciones arriba')}</button>}
      </section>

      <section className="planning-panel preference-panel">
        <div className="section-title"><div><h3>{l('Preferências de inteligência','Intelligence preferences','Preferencias de inteligencia')}</h3><span>{l('assunto, urgência e canal','topic, urgency and channel','tema, urgencia y canal')}</span></div></div>
        <div className="intelligence-options">
          {([
            ['duplicates',l('Duplicidades','Duplicates','Duplicados')],
            ['amountIncreases',l('Reajustes e aumentos','Increases','Aumentos')],
            ['spendingChanges',l('Mudanças no mês','Monthly changes','Cambios del mes')],
            ['subscriptions',l('Assinaturas','Subscriptions','Suscripciones')],
            ['dueBills',l('Vencimentos','Due dates','Vencimientos')],
            ['potSuggestions',l('Sugestões de Cofrinho','Savings-pot suggestions','Sugerencias de alcancía')]
          ] as Array<[keyof Pick<IntelligencePreferences,'duplicates'|'amountIncreases'|'spendingChanges'|'subscriptions'|'dueBills'|'potSuggestions'>,string]>).map(([key,label])=><button type="button" key={key} aria-pressed={prefs[key]} disabled={prefsSaving} className={prefs[key]?'active':''} onClick={()=>void toggleSubject(key)}><span>{label}</span><b>{prefs[key]?l('Ativo','On','Activo'):l('Silenciado','Muted','Silenciado')}</b></button>)}
        </div>
        <label className="preference-select"><span>{l('Mostrar a partir de','Show starting at','Mostrar desde')}</span><select value={prefs.minimumUrgency} disabled={prefsSaving} onChange={async e=>{
          const previous=prefs;
          const next={...prefs,minimumUrgency:e.target.value as IntelligencePreferences['minimumUrgency']};
          setPrefs(next);setPrefsSaving(true);
          try{const result=await saveIntelligencePreferences(householdId,next);setPrefs(result.preferences);}catch{setPrefs(previous);}finally{setPrefsSaving(false);}
        }}><option value="critical">{l('Só crítico','Critical only','Solo crítico')}</option><option value="high">{l('Alta prioridade','High priority','Alta prioridad')}</option><option value="normal">{l('Normal','Normal','Normal')}</option><option value="low">{l('Tudo, inclusive baixa prioridade','Everything, including low priority','Todo, incluso baja prioridad')}</option></select></label>
        <p className="planning-disclaimer">{l('Canal no app está ativo. Notificações do aparelho só serão usadas quando o produto ativar esse canal; a preferência fica preparada sem enviar nada hoje.','In-app is active. Device notifications will only be used once that channel is enabled; the preference can be prepared without sending anything today.','El canal dentro de la app está activo. Las notificaciones del dispositivo solo se usarán cuando se habilite ese canal; la preferencia queda preparada sin enviar nada hoy.')}</p>
      </section>
    </div>
  </section>;
}
