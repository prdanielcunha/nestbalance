'use client';
import {useRef,useState} from 'react';
import {MoneyValue} from '@/src/features/privacy/money-value';
import Link from 'next/link';
import {deriveBalanceComposition,deriveSpendingAvailability,type BalanceCoverage} from '@/src/core/balance-composition';
import {parseMoneyInputToMinor} from '@/src/core/accounts';
import {useI18n} from '@/src/i18n/locale-provider';
import {updateHouseholdAccountBalance} from '@/src/lib/repositories/accounts';
import type {HomeAccount,HomeSavingsPot} from '@/src/lib/repositories/home';

export function BalanceOverview({householdId,accounts,pots,canManage,onChanged,commitmentsMinor=0,loading=false}:{householdId:string;accounts:HomeAccount[];pots:HomeSavingsPot[];canManage:boolean;onChanged:()=>void;commitmentsMinor?:number;loading?:boolean}){
  const {locale,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const composition=deriveBalanceComposition(accounts,pots);
  const spending=deriveSpendingAvailability(composition,commitmentsMinor);
  const accountDetails=useRef<HTMLDetailsElement>(null);
  const valueId=(key:string)=>`${householdId}:home:${key}`;
  const primaryLabel=composition.complete?l('Saldo fora dos cofrinhos','Balance outside savings pots','Saldo fuera de alcancías'):l('Saldo informado nas contas','Reported account balance','Saldo informado en cuentas');
  const savingsLabel=l('Guardado nos cofrinhos','Saved in savings pots','Guardado en alcancías');
  const spendingLabel=l('Disponível para gastar','Available to spend','Disponible para gastar');
  function reviewFirst(){
    if(accountDetails.current) accountDetails.current.open=true;
    const account=composition.rows.find(r=>r.amountMinor===null)?.account;
    if(account&&canManage){setEditing(account.id);setCoverage(account.balanceCoverage||'unknown');setIncluded(account.includedSavingsMinor==null?'':(account.includedSavingsMinor/100).toLocaleString(locale,{useGrouping:false,minimumFractionDigits:2}));}
    accountDetails.current?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  const [editing,setEditing]=useState<string|null>(null);
  const [coverage,setCoverage]=useState<BalanceCoverage>('unknown');
  const [included,setIncluded]=useState('');
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  async function save(account:HomeAccount){
    const amount=coverage==='includes_pots'?parseMoneyInputToMinor(included,locale):0;
    if(account.balanceMinor===null||amount===null||amount<0||(coverage==='includes_pots'&&amount>account.balanceMinor)){
      setError(l('Confira o valor separado dentro deste saldo.','Check the amount saved within this balance.','Revisa el importe separado dentro de este saldo.'));return;
    }
    setWorking(true);setError('');
    try{
      await updateHouseholdAccountBalance({householdId,accountId:account.id,balanceMinor:account.balanceMinor,balanceCoverage:coverage,includedSavingsMinor:coverage==='includes_pots'?amount:null,expectedUpdatedAtMs:account.updatedAtMs??null,coverageOnly:true});
      setEditing(null);onChanged();
    }catch{setError(l('Os dados podem ter mudado. Atualize a tela antes de tentar novamente.','The data may have changed. Refresh before trying again.','Los datos pueden haber cambiado. Actualiza antes de intentar otra vez.'));}
    finally{setWorking(false);}
  }
  return <section className="hero-balance home-balance-card balance-overview" aria-label={l('Seus saldos','Your balances','Tus saldos')}>
    <div className="balance-summary-grid" aria-busy={loading}>
      <div className="balance-primary">
        <span>{primaryLabel}</span>
        <strong data-testid="home-account-balance"><MoneyValue id={valueId('balance')} minor={composition.outsideMinor??composition.reportedMinor} label={primaryLabel}/></strong>
        <p>{loading?l('Atualizando saldos…','Refreshing balances…','Actualizando saldos…'):composition.complete?l('Dinheiro nas contas, sem as reservas.','Money in accounts, excluding savings.','Dinero en cuentas, sin las reservas.'):composition.reportedMinor!==null?l('Saldo conhecido. A separação das reservas ainda precisa ser conferida.','Known balance. The savings portion still needs review.','Saldo conocido. Falta revisar la parte reservada.'):l('Ainda não há saldo informado. Adicione uma conta ou envie um print.','No balance reported yet. Add an account or send a screenshot.','Aún no hay saldo informado. Agrega una cuenta o envía una captura.')}</p>
      </div>
      <div className="balance-savings-secondary">
        <span>{savingsLabel}</span>
        <strong data-testid="home-savings-balance"><MoneyValue id={valueId('savings')} minor={loading?null:composition.savedMinor} label={savingsLabel}/></strong>
        <small>{composition.sources.length?l(`${composition.sources.length} cofrinho(s) nesta visão.`,`${composition.sources.length} savings pot(s) in this view.`,`${composition.sources.length} alcancía(s) en esta vista.`):l('Nenhum cofrinho registrado nesta visão.','No savings pots recorded in this view.','No hay alcancías registradas en esta vista.')}</small>
      </div>
      <section className={`home-safe-card ${spending.shortfallMinor&&composition.complete?'warning':''}`} aria-label={spendingLabel}>
        <span>{spendingLabel}</span>
        <strong data-testid="home-spending-balance">{spending.provisional&&spending.amountMinor!==null&&<small>{l('Até ','Up to ','Hasta ')}</small>}<MoneyValue id={valueId('spending')} minor={spending.amountMinor} label={spendingLabel}/></strong>
        <span className="balance-estimate-label">{spending.provisional?l('Provisório · conferir reservas','Provisional · review savings','Provisional · revisar reservas'):l('Estimativa após as contas','Estimate after bills','Estimación después de las cuentas')}</span>
        <p>{spending.provisional?l('Pode incluir dinheiro guardado. Confirme a composição para saber quanto está livre.','May include savings. Confirm coverage to see how much is free.','Puede incluir reservas. Confirma la composición para saber cuánto queda libre.'):l('Saldo fora dos cofrinhos menos as contas pendentes registradas. Não inclui renda futura.','Balance outside savings pots minus recorded unpaid bills. Future income is excluded.','Saldo fuera de alcancías menos las cuentas pendientes registradas. No incluye ingresos futuros.')}</p>
        {!!spending.shortfallMinor&&composition.complete&&<p className="balance-shortfall">{l('Falta para cobrir as contas: ','Gap to cover bills: ','Falta para cubrir cuentas: ')}<MoneyValue id={valueId('shortfall')} minor={spending.shortfallMinor} label={l('Falta para cobrir as contas','Gap to cover bills','Falta para cubrir cuentas')}/></p>}
        <details className="spending-calculation"><summary>{l('Como calculamos','How we calculate it','Cómo lo calculamos')}</summary>
          <div><span>{composition.complete?primaryLabel:l('Saldo considerado · provisório','Balance used · provisional','Saldo considerado · provisional')}</span><MoneyValue id={valueId('calculation-balance')} minor={composition.outsideMinor??composition.provisionalOutsideMinor} label={primaryLabel}/></div>
          <div><span>{l('Contas e faturas pendentes','Unpaid bills and card statements','Cuentas y facturas pendientes')}</span><MoneyValue id={valueId('pending')} minor={spending.commitmentsMinor} label={l('Contas pendentes','Unpaid bills','Cuentas pendientes')}/></div>
          <p>{l('Usamos apenas os registros desta visão. Contas não cadastradas e saldos antigos podem mudar a estimativa.','Only records in this view are used. Missing bills and old balances may change the estimate.','Solo usamos registros de esta vista. Las cuentas no registradas y los saldos antiguos pueden cambiar la estimación.')}</p>
        </details>
        {composition.pendingCount>0&&<button className="text-button balance-review-action" type="button" onClick={reviewFirst}>{canManage?l('Conferir composição agora','Review coverage now','Revisar composición ahora'):l('Ver saldos a conferir','View balances to review','Ver saldos para revisar')}</button>}
        {spending.amountMinor===null&&<Link href="/accounts">{l('Informar saldo','Add a balance','Informar saldo')}</Link>}
      </section>
    </div>
    <details ref={accountDetails} className="balance-explanation balance-accounts-details">
      <summary>{l('Ver detalhes das contas','View account details','Ver detalles de cuentas')} · {composition.rows.length}</summary>
      <div className="balance-source-list">{composition.rows.map(({account,amountMinor,stale})=><article key={account.id}>
        <div><b>{account.name}</b><span>{account.institutionName||l('Origem manual','Manual source','Origen manual')}{account.last4?` · ${account.last4}`:''}</span></div>
        <strong><MoneyValue id={`${householdId}:account:${account.id}`} minor={amountMinor??account.balanceMinor} label={account.name} currency={account.currency}/></strong>
        {amountMinor===null&&<small className="balance-pending-note">{l('Saldo informado · composição a conferir','Reported balance · review coverage','Saldo informado · revisar composición')}</small>}
        <small>{account.observedOn||account.balanceAsOfMs?l('Saldo observado em ','Balance observed on ','Saldo observado el ')+formatDate(account.observedOn?new Date(account.observedOn+'T12:00:00'):new Date(account.balanceAsOfMs!),{day:'2-digit',month:'short',year:'numeric'}):l('Data de atualização não informada','Update date unavailable','Fecha de actualización no informada')}{stale?' · '+l('Conferir atualização','Check freshness','Revisar actualización'):''}</small>
        {canManage&&<button className="text-button" type="button" onClick={()=>{setEditing(account.id);setCoverage(account.balanceCoverage||'unknown');setIncluded(account.includedSavingsMinor==null?'':(account.includedSavingsMinor/100).toLocaleString(locale,{useGrouping:false,minimumFractionDigits:2}));}}>{l('Conferir composição','Review coverage','Revisar composición')}</button>}
        {editing===account.id&&<div className="balance-coverage-editor">
          <label>{l('O saldo informado inclui cofrinhos?','Does the reported balance include savings pots?','¿El saldo informado incluye alcancías?')}<select value={coverage} onChange={e=>setCoverage(e.target.value as BalanceCoverage)}>
            <option value="unknown">{l('Ainda não sei','Not sure yet','Aún no sé')}</option>
            <option value="excludes_pots">{l('Não, já está sem cofrinhos','No, it already excludes them','No, ya los excluye')}</option>
            <option value="includes_pots">{l('Sim, inclui dinheiro guardado','Yes, it includes savings','Sí, incluye dinero guardado')}</option>
          </select></label>
          {coverage==='includes_pots'&&<label>{l('Quanto desse saldo está nos cofrinhos?','How much of this balance is in savings pots?','¿Cuánto de este saldo está en alcancías?')}<input inputMode="decimal" value={included} onChange={e=>setIncluded(e.target.value)}/></label>}
          <p>{l('Informe somente a parte incluída nesta conta. Não some novamente reservas já incluídas no saldo.','Enter only the portion included in this account. Do not count savings already included in its balance again.','Indica solo la parte incluida en esta cuenta. No vuelvas a contar reservas ya incluidas en su saldo.')}</p>
          <button className="primary-button" disabled={working||coverage==='unknown'} type="button" onClick={()=>void save(account)}>{l('Confirmar composição','Confirm coverage','Confirmar composición')}</button>
          <button className="text-button" disabled={working} type="button" onClick={()=>setEditing(null)}>{l('Cancelar','Cancel','Cancelar')}</button>
          {error&&<p role="alert" className="error-copy">{error}</p>}
        </div>}
      </article>)}</div>
      {!composition.rows.length&&<Link href="/accounts">{l('Informar uma conta','Add an account','Informar una cuenta')}</Link>}
    </details>
    <details className="balance-explanation balance-pots-details"><summary>{l('Ver detalhes dos cofrinhos','View savings details','Ver detalles de alcancías')} · {composition.sources.length}</summary>
      <div className="balance-source-list">{composition.sources.map(p=><article key={p.id}><b>{p.name}</b><span>{p.institutionName||l('Manual','Manual','Manual')}{p.sourceAccountLabel?` · ${p.sourceAccountLabel}`:''}</span><strong><MoneyValue id={`${householdId}:pot:${p.id}`} minor={p.balanceMinor} label={p.name} currency={p.currency}/></strong><small>{p.observedOn||p.updatedAtMs?l('Saldo observado em ','Balance observed on ','Saldo observado el ')+formatDate(p.observedOn?new Date(p.observedOn+'T12:00:00'):new Date(p.updatedAtMs!),{day:'2-digit',month:'short'}):l('Atualização não informada','Update unavailable','Actualización no informada')}</small></article>)}</div>
      <Link href="/pots">{l('Abrir cofrinhos e objetivos','Open savings pots and goals','Abrir alcancías y objetivos')}</Link>
    </details>
    {composition.stale&&<small>{l('Algumas fontes precisam de atualização. Você pode enviar um novo print.','Some sources need an update. You can send a new screenshot.','Algunas fuentes necesitan actualizarse. Puedes enviar una nueva captura.')}</small>}
    {composition.otherCurrencies.length>0&&<p>{l('Outras moedas não entram neste total: ','Other currencies excluded from this total: ','Otras monedas excluidas de este total: ')}{composition.otherCurrencies.join(', ')}. <Link href="/accounts">{l('Ver origens','View sources','Ver orígenes')}</Link></p>}
  </section>;
}
