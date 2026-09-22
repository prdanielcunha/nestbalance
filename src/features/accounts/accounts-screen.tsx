'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppNav } from '@/src/features/navigation/app-nav';
import { HouseholdLink } from '@/src/features/navigation/household-link';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { canHouseholdRole, type HouseholdRole } from '@/src/core/household';
import { updateHouseholdAccountBalance } from '@/src/lib/repositories/accounts';
import { AccountOnboarding } from '@/src/features/onboarding/account-onboarding';
import { CreditCardManager } from '@/src/features/cards/card-manager';
import { loadHomeData, type HomeAccount, type HomeCardSnapshot, type HomeCreditCard, type HomeInvoiceImport } from '@/src/lib/repositories/home';
import { ScopeViewSwitch, inFinancialView, type FinancialView } from '@/src/features/privacy/scope-view-switch';
import { useI18n } from '@/src/i18n/locale-provider';

export function AccountsScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const {t,locale,intlLocale,currency,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const currencySymbol=useMemo(()=>new Intl.NumberFormat(intlLocale,{style:'currency',currency,currencyDisplay:'narrowSymbol',minimumFractionDigits:0,maximumFractionDigits:0}).formatToParts(0).find(part=>part.type==='currency')?.value||currency,[intlLocale,currency]);
  const canManage=canHouseholdRole(role,'manage_finance');
  const [accounts,setAccounts]=useState<HomeAccount[]>([]);
  const [cards,setCards]=useState<HomeCreditCard[]>([]);
  const [invoiceImports,setInvoiceImports]=useState<HomeInvoiceImport[]>([]);
  const [cardSnapshots,setCardSnapshots]=useState<HomeCardSnapshot[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const [editingAccount,setEditingAccount]=useState<HomeAccount|null>(null);
  const [balanceInput,setBalanceInput]=useState('');
  const [savingBalance,setSavingBalance]=useState(false);
  const [balanceError,setBalanceError]=useState('');
  const [view,setView]=useState<FinancialView>('household');

  async function load(silent=false){
    if(!silent) setLoading(true);
    setError('');
    try{
      const data=await loadHomeData(householdId);
      setAccounts(data.accounts);
      setCards(data.cards||[]);
      setInvoiceImports(data.invoiceImports||[]);
      setCardSnapshots(data.cardSnapshots||[]);
    }catch{
      setError(l('Não conseguimos carregar suas contas agora.','We could not load your accounts right now.','No pudimos cargar tus cuentas ahora.'));
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
  },[householdId,refreshKey]);

  const viewAccounts=useMemo(()=>accounts.filter(item=>inFinancialView(item.scope,view)),[accounts,view]);
  const viewCards=useMemo(()=>cards.filter(item=>inFinancialView(item.scope,view)),[cards,view]);
  const viewInvoices=useMemo(()=>invoiceImports.filter(item=>inFinancialView(item.scope,view)),[invoiceImports,view]);
  const viewSnapshots=useMemo(()=>cardSnapshots.filter(item=>inFinancialView(item.scope,view)),[cardSnapshots,view]);
  const defaultCreateScope=view==='personal'?'personal':'household';

  const spendableTotal=useMemo(()=>viewAccounts
    .filter(item=>item.connectedProductType!=='investment')
    .reduce((sum,item)=>sum+item.balanceMinor,0),[viewAccounts]);
  const investmentTotal=useMemo(()=>viewAccounts
    .filter(item=>item.connectedProductType==='investment')
    .reduce((sum,item)=>sum+item.balanceMinor,0),[viewAccounts]);

  function refreshed(){
    setRefreshKey(value=>value+1);
  }

  function accountTypeLabel(account:HomeAccount){
    if(account.connectedProductType==='investment') return l('Investimento','Investment','Inversión');
    if(account.type==='wallet') return l('Carteira digital','Digital wallet','Billetera digital');
    if(account.type==='cash') return l('Dinheiro','Cash','Efectivo');
    return l('Conta bancária','Bank account','Cuenta bancaria');
  }

  function openBalance(account:HomeAccount){
    setEditingAccount(account);
    setBalanceInput((account.balanceMinor/100).toLocaleString(intlLocale,{
      minimumFractionDigits:2,
      maximumFractionDigits:2,
      useGrouping:false
    }));
    setBalanceError('');
  }

  async function saveBalance(){
    if(!editingAccount||savingBalance) return;
    const balanceMinor=parseMoneyInputToMinor(balanceInput,locale);
    if(balanceMinor===null){
      setBalanceError(l('Digite um saldo válido.','Enter a valid balance.','Escribe un saldo válido.'));
      return;
    }
    setSavingBalance(true);
    setBalanceError('');
    try{
      await updateHouseholdAccountBalance({
        householdId,
        accountId:editingAccount.id,
        balanceMinor
      });
      setEditingAccount(null);
      refreshed();
    }catch(err:any){
      const code=String(err?.message||'');
      setBalanceError(code==='ACCOUNT_NOT_ACTIVE'
        ? l('Essa conta não está mais ativa.','This account is no longer active.','Esta cuenta ya no está activa.')
        : l('Não conseguimos atualizar esse saldo agora.','We could not update this balance right now.','No pudimos actualizar este saldo ahora.'));
    }finally{
      setSavingBalance(false);
    }
  }

  return <main className="app-shell accounts-shell">
    <header className="topbar">
      <div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">{t.navAccounts}</span></div>
      <div className="topbar-actions">
        {canManage&&<AccountOnboarding householdId={householdId} variant="compact" defaultScope={defaultCreateScope} onCreated={refreshed}/>}
        <HouseholdLink/>
      </div>
    </header>
    <ScopeViewSwitch value={view} onChange={setView}/>

    <section className="area-hero accounts-hero">
      <span>{l('Onde seu dinheiro está','Where your money is','Dónde está tu dinero')}</span>
      <h1>{viewAccounts.length?formatMoney(spendableTotal):l('Suas contas em um só lugar.','Your accounts in one place.','Tus cuentas en un solo lugar.')}</h1>
      <p>{viewAccounts.length
        ? investmentTotal>0
          ? l(
              `${formatMoney(investmentTotal)} estão separados como investimentos e não entram no dinheiro disponível.`,
              `${formatMoney(investmentTotal)} is separated as investments and is not included in available money.`,
              `${formatMoney(investmentTotal)} está separado como inversiones y no entra en el dinero disponible.`
            )
          : l('Saldo disponível conhecido nas contas ativas desta visão.','Known available balance across active accounts in this view.','Saldo disponible conocido en las cuentas activas de esta vista.')
        : canManage
          ? l(
              'Adicione sua primeira conta ou envie um print, extrato ou arquivo. O NestBalance organiza o que conseguir reconhecer e pede só o que faltar.',
              'Add your first account or send a screenshot, statement, or file. NestBalance organizes what it can recognize and asks only for what is missing.',
              'Agrega tu primera cuenta o envía una captura, extracto o archivo. NestBalance organiza lo que reconoce y pregunta solo lo que falta.'
            )
          : l('Um administrador pode adicionar contas; você pode consultar o que já existe.','An administrator can add accounts; you can view what is already here.','Un administrador puede agregar cuentas; tú puedes consultar lo que ya existe.')}</p>
      {canManage&&<div className="area-hero-actions">
        <Link className="primary-button" href="/add?return=/accounts">{l('Enviar print ou arquivo','Send screenshot or file','Enviar captura o archivo')}</Link>
        <span>{l('Você também pode usar “Adicionar conta” acima para informar só o saldo.','You can also use “Add account” above to enter just the balance.','También puedes usar “Agregar cuenta” arriba para informar solo el saldo.')}</span>
      </div>}
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}

    <section>
      <div className="section-title"><h2>{l('Seus saldos','Your balances','Tus saldos')}</h2><span>{l(
        `${viewAccounts.length} conta${viewAccounts.length===1?'':'s'}`,
        `${viewAccounts.length} account${viewAccounts.length===1?'':'s'}`,
        `${viewAccounts.length} cuenta${viewAccounts.length===1?'':'s'}`
      )}</span></div>
      {loading
        ? <div className="account-balance-grid">{[0,1].map(i=><div className="account-balance-tile skeleton-line" key={i}/>)}</div>
        : viewAccounts.length===0
          ? <div className="empty-state"><h3>{l('Nenhum saldo informado ainda.','No balance added yet.','Todavía no hay saldos informados.')}</h3><p>{canManage
              ? l('Use “Adicionar conta” para começar.','Use “Add account” to get started.','Usa “Agregar cuenta” para empezar.')
              : l('Um administrador ainda não adicionou contas a este Lar.','An administrator has not added accounts to this Household yet.','Un administrador todavía no agregó cuentas a este Hogar.')}</p></div>
          : <div className="account-balance-grid">
              {viewAccounts.map(account=><article className="account-balance-tile" key={account.id}>
                <span>{accountTypeLabel(account)}{account.scope==='personal'&&<em className="personal-pill">{t.scopePersonal}</em>}</span>
                <h3>{account.name}</h3>
                <strong>{formatMoney(account.balanceMinor)}</strong>
                {account.automaticallyInvestedMinor&&account.automaticallyInvestedMinor>0
                  ? <small>{l(
                      `${formatMoney(account.automaticallyInvestedMinor)} reservado nesta conta`,
                      `${formatMoney(account.automaticallyInvestedMinor)} reserved in this account`,
                      `${formatMoney(account.automaticallyInvestedMinor)} reservado en esta cuenta`
                    )}</small>
                  : null}
                <div className="account-balance-foot">
                  <small>{account.institutionName||l('Saldo atual informado','Current balance provided','Saldo actual informado')}</small>
                  {canManage&&<button type="button" onClick={()=>openBalance(account)}>{l('Atualizar','Update','Actualizar')}</button>}
                </div>
              </article>)}
            </div>}
    </section>

    {!loading&&viewSnapshots.length>0&&<section className="recognized-cards-section">
      <div className="section-title"><div><h2>{l('Cartões reconhecidos','Recognized cards','Tarjetas reconocidas')}</h2><span>{l('informações vistas nos seus prints','information seen in your screenshots','información vista en tus capturas')}</span></div></div>
      <div className="recognized-card-grid">
        {viewSnapshots.map(card=><article className="recognized-card" key={card.id}>
          <span>{card.institutionName||l('Cartão','Card','Tarjeta')}{card.scope==='personal'&&<em className="personal-pill">{t.scopePersonal}</em>}</span>
          <h3>{card.name}{card.last4?' · '+card.last4:''}</h3>
          {card.statementAmountMinor!==null&&<strong>{formatMoney(card.statementAmountMinor)}</strong>}
          {card.dueOn&&<small>{l('Vence em','Due','Vence')} {formatDate(new Date(card.dueOn+'T12:00:00'),{day:'2-digit',month:'2-digit',year:'numeric'})}</small>}
          {card.availableLimitMinor!==null&&<small>{l('Limite disponível','Available limit','Límite disponible')}: {formatMoney(card.availableLimitMinor)}</small>}
        </article>)}
      </div>
    </section>}

    {!loading&&<CreditCardManager
      householdId={householdId}
      cards={viewCards}
      accounts={viewAccounts}
      invoiceImports={viewInvoices}
      defaultScope={defaultCreateScope}
      canManage={canManage}
      suggestedCards={viewSnapshots}
      onCreated={refreshed}
    />}

    <AppNav canContribute={role!=='read_only'}/>

    {canManage&&editingAccount&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!savingBalance&&setEditingAccount(null)}>
      <section className="capture-sheet balance-update-sheet" role="dialog" aria-modal="true" aria-label={l('Atualizar saldo','Update balance','Actualizar saldo')}>
        <div className="sheet-handle"/>
        <div className="eyebrow">{l('Saldo atual','Current balance','Saldo actual')}</div>
        <h2>{editingAccount.name}</h2>
        <p>{l(
          'Informe quanto existe nessa conta agora. Isso não cria uma entrada nem uma saída; apenas atualiza o ponto de referência do saldo.',
          'Enter how much is in this account now. This does not create income or an expense; it only updates the balance reference point.',
          'Indica cuánto hay en esta cuenta ahora. Esto no crea una entrada ni un gasto; solo actualiza el punto de referencia del saldo.'
        )}</p>
        <label className="field-label" htmlFor="balance-update-value">{l('Saldo','Balance','Saldo')}</label>
        <div className="money-input-wrap"><span>{currencySymbol}</span><input id="balance-update-value" autoFocus inputMode="decimal" value={balanceInput} onChange={e=>setBalanceInput(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
        <small className="field-help">{l('Pode ser negativo se a conta estiver no vermelho.','It can be negative if the account is overdrawn.','Puede ser negativo si la cuenta está en descubierto.')}</small>
        {balanceError&&<p className="error-copy" role="alert">{balanceError}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={savingBalance} onClick={()=>setEditingAccount(null)}>{l('Cancelar','Cancel','Cancelar')}</button>
          <button className="primary-button" disabled={savingBalance} onClick={saveBalance}>{savingBalance
            ? l('Atualizando…','Updating…','Actualizando…')
            : l('Atualizar saldo','Update balance','Actualizar saldo')}</button>
        </div>
      </section>
    </div>}
  </main>;
}
