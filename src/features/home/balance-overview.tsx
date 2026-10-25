'use client';
import {useState} from 'react';
import Link from 'next/link';
import {deriveBalanceComposition,type BalanceCoverage} from '@/src/core/balance-composition';
import {parseMoneyInputToMinor} from '@/src/core/accounts';
import {useI18n} from '@/src/i18n/locale-provider';
import {updateHouseholdAccountBalance} from '@/src/lib/repositories/accounts';
import type {HomeAccount,HomeSavingsPot} from '@/src/lib/repositories/home';

export function BalanceOverview({householdId,accounts,pots,canManage,onChanged}:{householdId:string;accounts:HomeAccount[];pots:HomeSavingsPot[];canManage:boolean;onChanged:()=>void}){
  const {locale,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const composition=deriveBalanceComposition(accounts,pots);
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
    <span>{l('Saldo fora dos cofrinhos','Balance outside savings pots','Saldo fuera de alcancías')}</span>
    <strong aria-live="polite">{composition.outsideMinor===null?'—':formatMoney(composition.outsideMinor)}</strong>
    <p>{composition.complete?l('Com base nos últimos saldos informados. Contas a pagar aparecem separadamente.','Based on the latest reported balances. Upcoming bills are shown separately.','Según los últimos saldos informados. Las cuentas pendientes aparecen por separado.'):l(accounts.length?'Confirme a composição dos saldos para calcular sem contar dinheiro duas vezes.':'Ainda não há saldo informado. Adicione uma conta ou envie um print.','Confirm balance coverage to calculate without counting money twice.','Confirma la composición de los saldos para calcular sin contar dinero dos veces.')}</p>
    <details className="balance-explanation">
      <summary>{l('Ver detalhes das contas','View account details','Ver detalles de cuentas')} · {composition.rows.length}</summary>
      <div className="balance-source-list">{composition.rows.map(({account,amountMinor,stale})=><article key={account.id}>
        <div><b>{account.name}</b><span>{account.institutionName||l('Origem manual','Manual source','Origen manual')}{account.last4?` · ${account.last4}`:''}</span></div>
        <strong>{amountMinor===null?l('Composição pendente','Coverage pending','Composición pendiente'):formatMoney(amountMinor)}</strong>
        <small>{account.balanceAsOfMs?l('Saldo informado em ','Balance reported on ','Saldo informado el ')+formatDate(new Date(account.balanceAsOfMs),{day:'2-digit',month:'short',year:'numeric'}):l('Data de atualização não informada','Update date unavailable','Fecha de actualización no informada')}{stale?' · '+l('Conferir atualização','Check freshness','Revisar actualización'):''}</small>
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
    <div className="balance-savings-secondary">
      <span>{l('Guardado nos cofrinhos','Saved in savings pots','Guardado en alcancías')}</span>
      <strong>{composition.sources.length?formatMoney(composition.savedMinor):'—'}</strong>
      <details className="balance-explanation"><summary>{l('Ver detalhes dos cofrinhos','View savings details','Ver detalles de alcancías')} · {composition.sources.length}</summary>
        <div className="balance-source-list">{pots.filter(p=>p.status==='active'&&p.currency==='BRL').map(p=><article key={p.id}><b>{p.name}</b><span>{p.institutionName||l('Manual','Manual','Manual')}{p.sourceAccountLabel?` · ${p.sourceAccountLabel}`:''}</span><strong>{formatMoney(p.balanceMinor)}</strong><small>{p.updatedAtMs?l('Atualizado em ','Updated on ','Actualizado el ')+formatDate(new Date(p.updatedAtMs),{day:'2-digit',month:'short'}):l('Atualização não informada','Update unavailable','Actualización no informada')}</small></article>)}</div>
        <Link href="/pots">{l('Abrir cofrinhos e objetivos','Open savings pots and goals','Abrir alcancías y objetivos')}</Link>
      </details>
    </div>
    {composition.stale&&<small>{l('Algumas fontes precisam de atualização. Você pode enviar um novo print.','Some sources need an update. You can send a new screenshot.','Algunas fuentes necesitan actualizarse. Puedes enviar una nueva captura.')}</small>}
    {composition.otherCurrencies.length>0&&<p>{l('Outras moedas não entram neste total: ','Other currencies excluded from this total: ','Otras monedas excluidas de este total: ')}{composition.otherCurrencies.join(', ')}. <Link href="/accounts">{l('Ver origens','View sources','Ver orígenes')}</Link></p>}
  </section>;
}
