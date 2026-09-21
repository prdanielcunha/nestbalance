'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppNav } from '@/src/features/navigation/app-nav';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import type { HouseholdRole } from '@/src/core/household';
import { updateHouseholdAccountBalance } from '@/src/lib/repositories/accounts';
import { AccountOnboarding } from '@/src/features/onboarding/account-onboarding';
import { CreditCardManager } from '@/src/features/cards/card-manager';
import { ConnectedBanks } from '@/src/features/open-finance/connected-banks';
import { loadHomeData, type HomeAccount, type HomeCardSnapshot, type HomeCreditCard, type HomeInvoiceImport, type HomeSavingsPot } from '@/src/lib/repositories/home';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const typeLabel:Record<string,string>={bank:'Conta bancária',wallet:'Carteira digital',cash:'Dinheiro'};

export function AccountsScreen({householdId,role}:{householdId:string;role:HouseholdRole}){
  const canManage=role==='owner'||role==='admin';
  const [accounts,setAccounts]=useState<HomeAccount[]>([]);
  const [cards,setCards]=useState<HomeCreditCard[]>([]);
  const [invoiceImports,setInvoiceImports]=useState<HomeInvoiceImport[]>([]);
  const [savingsPots,setSavingsPots]=useState<HomeSavingsPot[]>([]);
  const [cardSnapshots,setCardSnapshots]=useState<HomeCardSnapshot[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const [editingAccount,setEditingAccount]=useState<HomeAccount|null>(null);
  const [balanceInput,setBalanceInput]=useState('');
  const [savingBalance,setSavingBalance]=useState(false);
  const [balanceError,setBalanceError]=useState('');

  async function load(silent=false){
    if(!silent) setLoading(true);
    setError('');
    try{
      const data=await loadHomeData(householdId);
      setAccounts(data.accounts);
      setCards(data.cards||[]);
      setInvoiceImports(data.invoiceImports||[]);
      setSavingsPots(data.savingsPots||[]);
      setCardSnapshots(data.cardSnapshots||[]);
    }catch{
      setError('Não conseguimos carregar suas contas agora.');
    }finally{
      if(!silent) setLoading(false);
    }
  }

  useEffect(()=>{void load();},[householdId,refreshKey]);

  const spendableTotal=useMemo(()=>accounts
    .filter(item=>item.connectedProductType!=='investment')
    .reduce((sum,item)=>sum+item.balanceMinor,0),[accounts]);
  const investmentTotal=useMemo(()=>accounts
    .filter(item=>item.connectedProductType==='investment')
    .reduce((sum,item)=>sum+item.balanceMinor,0),[accounts]);
  const savedTotal=useMemo(()=>savingsPots.reduce((sum,item)=>sum+item.balanceMinor,0),[savingsPots]);

  function refreshed(){
    setRefreshKey(value=>value+1);
  }

  function openBalance(account:HomeAccount){
    setEditingAccount(account);
    setBalanceInput((account.balanceMinor/100).toFixed(2).replace('.',','));
    setBalanceError('');
  }

  async function saveBalance(){
    if(!editingAccount||savingBalance) return;
    const balanceMinor=parseMoneyInputToMinor(balanceInput);
    if(balanceMinor===null){
      setBalanceError('Digite um saldo válido.');
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
      setBalanceError(code==='ACCOUNT_NOT_ACTIVE'?'Essa conta não está mais ativa.':'Não conseguimos atualizar esse saldo agora.');
    }finally{
      setSavingBalance(false);
    }
  }

  return <main className="app-shell accounts-shell">
    <header className="topbar">
      <div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">Contas</span></div>
      <div className="topbar-actions">
        {canManage&&<AccountOnboarding householdId={householdId} variant="compact" onCreated={refreshed}/>}
        <Link href="/household" className="avatar-dot" aria-label="Lar e acessos"/>
      </div>
    </header>

    <section className="area-hero accounts-hero">
      <span>Onde seu dinheiro está</span>
      <h1>{accounts.length?money.format(spendableTotal/100):'Suas contas em um só lugar.'}</h1>
      <p>{accounts.length
        ? investmentTotal>0
          ? `${money.format(investmentTotal/100)} estão separados como investimentos e não entram no dinheiro disponível.`
          : 'Saldo disponível conhecido nas contas ativas do Lar.'
        : canManage ? 'Adicione uma conta manualmente ou conecte seu banco com Open Finance.' : 'Um administrador pode adicionar contas; você pode consultar o que já existe.'}</p>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}

    <section>
      <div className="section-title"><h2>Seus saldos</h2><span>{accounts.length} conta{accounts.length===1?'':'s'}</span></div>
      {loading
        ? <div className="account-balance-grid">{[0,1].map(i=><div className="account-balance-tile skeleton-line" key={i}/>)}</div>
        : accounts.length===0
          ? <div className="empty-state"><h3>Nenhum saldo informado ainda.</h3><p>Use “Adicionar conta” para começar.</p></div>
          : <div className="account-balance-grid">
              {accounts.map(account=>{
                const connected=account.source==='open_finance';
                const investment=account.connectedProductType==='investment';
                return <article className={connected?'account-balance-tile connected':'account-balance-tile'} key={account.id}>
                  <span>{investment?'Investimento':connected?'Conta conectada':typeLabel[account.type]||'Conta'}</span>
                  <h3>{account.name}</h3>
                  <strong>{money.format(account.balanceMinor/100)}</strong>
                  {account.automaticallyInvestedMinor&&account.automaticallyInvestedMinor>0
                    ? <small>{money.format(account.automaticallyInvestedMinor/100)} aplicado automaticamente</small>
                    : null}
                  <div className="account-balance-foot">
                    <small>{connected
                      ? `${account.institutionName||'Open Finance'} · saldo sincronizado`
                      : 'Saldo atual informado'}</small>
                    {connected
                      ? <span className="synced-account-pill">Automático</span>
                      : <button type="button" onClick={()=>openBalance(account)}>Atualizar</button>}
                  </div>
                </article>;
              })}
            </div>}
    </section>

    {!loading&&savingsPots.length>0&&<section className="savings-pots-section">
      <div className="section-title"><div><h2>Dinheiro guardado</h2><span>{money.format(savedTotal/100)} separado do saldo para gastar</span></div></div>
      <div className="savings-pot-grid">
        {savingsPots.map(pot=><article className="savings-pot-card" key={pot.id}>
          <span>{pot.institutionName||'Importado de um print'}</span>
          <h3>{pot.name}</h3>
          <strong>{money.format(pot.balanceMinor/100)}</strong>
          {pot.goalMinor&&pot.goalMinor>0?<small>Meta {money.format(pot.goalMinor/100)}</small>:<small>Valor identificado na tela</small>}
        </article>)}
      </div>
    </section>}

    {!loading&&cardSnapshots.length>0&&<section className="recognized-cards-section">
      <div className="section-title"><div><h2>Cartões reconhecidos</h2><span>informações vistas nos seus prints</span></div></div>
      <div className="recognized-card-grid">
        {cardSnapshots.map(card=><article className="recognized-card" key={card.id}>
          <span>{card.institutionName||'Cartão'}</span>
          <h3>{card.name}{card.last4?' · '+card.last4:''}</h3>
          {card.statementAmountMinor!==null&&<strong>{money.format(card.statementAmountMinor/100)}</strong>}
          {card.dueOn&&<small>Vence em {new Intl.DateTimeFormat('pt-BR').format(new Date(card.dueOn+'T12:00:00'))}</small>}
          {card.availableLimitMinor!==null&&<small>Limite disponível: {money.format(card.availableLimitMinor/100)}</small>}
        </article>)}
      </div>
    </section>}

    {!loading&&canManage&&<ConnectedBanks householdId={householdId} accounts={accounts} onSynced={refreshed}/>}
    
    {!loading&&<CreditCardManager
      householdId={householdId}
      cards={cards}
      accounts={accounts}
      invoiceImports={invoiceImports}
      onCreated={refreshed}
    />}

    <AppNav/>

    {canManage&&editingAccount&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!savingBalance&&setEditingAccount(null)}>
      <section className="capture-sheet balance-update-sheet" role="dialog" aria-modal="true" aria-label="Atualizar saldo">
        <div className="sheet-handle"/>
        <div className="eyebrow">Saldo atual</div>
        <h2>{editingAccount.name}</h2>
        <p>Informe quanto existe nessa conta agora. Isso não cria uma entrada nem uma saída; apenas atualiza o ponto de referência do saldo.</p>
        <label className="field-label" htmlFor="balance-update-value">Saldo</label>
        <div className="money-input-wrap"><span>R$</span><input id="balance-update-value" autoFocus inputMode="decimal" value={balanceInput} onChange={e=>setBalanceInput(e.target.value)} placeholder="0,00"/></div>
        <small className="field-help">Pode ser negativo se a conta estiver no vermelho.</small>
        {balanceError&&<p className="error-copy" role="alert">{balanceError}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={savingBalance} onClick={()=>setEditingAccount(null)}>Cancelar</button>
          <button className="primary-button" disabled={savingBalance} onClick={saveBalance}>{savingBalance?'Atualizando…':'Atualizar saldo'}</button>
        </div>
      </section>
    </div>}
  </main>;
}
