'use client';
import { useEffect, useMemo, useState } from 'react';
import { AppNav } from '@/src/features/navigation/app-nav';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { updateHouseholdAccountBalance } from '@/src/lib/repositories/accounts';
import { AccountOnboarding } from '@/src/features/onboarding/account-onboarding';
import { CreditCardManager } from '@/src/features/cards/card-manager';
import { loadHomeData, type HomeAccount, type HomeCreditCard, type HomeInvoiceImport } from '@/src/lib/repositories/home';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const typeLabel:Record<string,string>={bank:'Conta bancária',wallet:'Carteira digital',cash:'Dinheiro'};

export function AccountsScreen({householdId}:{householdId:string}){
  const [accounts,setAccounts]=useState<HomeAccount[]>([]);
  const [cards,setCards]=useState<HomeCreditCard[]>([]);
  const [invoiceImports,setInvoiceImports]=useState<HomeInvoiceImport[]>([]);
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
    }catch{
      setError('Não conseguimos carregar suas contas agora.');
    }finally{
      if(!silent) setLoading(false);
    }
  }

  useEffect(()=>{void load();},[householdId,refreshKey]);

  const total=useMemo(()=>accounts.reduce((sum,item)=>sum+item.balanceMinor,0),[accounts]);

  function refreshed(){
    setRefreshKey(value=>value+1);
    void load(true);
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
      <AccountOnboarding householdId={householdId} variant="compact" onCreated={refreshed}/>
    </header>

    <section className="area-hero accounts-hero">
      <span>Onde seu dinheiro está</span>
      <h1>{accounts.length?money.format(total/100):'Suas contas em um só lugar.'}</h1>
      <p>{accounts.length?'Saldo total conhecido nas contas ativas do Lar.':'Adicione conta bancária, carteira digital ou dinheiro sem informar agência ou número da conta.'}</p>
    </section>

    {error&&<p className="error-copy" role="alert">{error}</p>}

    <section>
      <div className="section-title"><h2>Seus saldos</h2><span>{accounts.length} conta{accounts.length===1?'':'s'}</span></div>
      {loading
        ? <div className="account-balance-grid">{[0,1].map(i=><div className="account-balance-tile skeleton-line" key={i}/>)}</div>
        : accounts.length===0
          ? <div className="empty-state"><h3>Nenhum saldo informado ainda.</h3><p>Use “Adicionar conta” para começar.</p></div>
          : <div className="account-balance-grid">
              {accounts.map(account=><article className="account-balance-tile" key={account.id}>
                <span>{typeLabel[account.type]||'Conta'}</span>
                <h3>{account.name}</h3>
                <strong>{money.format(account.balanceMinor/100)}</strong>
                <div className="account-balance-foot"><small>Saldo atual informado</small><button type="button" onClick={()=>openBalance(account)}>Atualizar</button></div>
              </article>)}
            </div>}
    </section>

    <CreditCardManager
      householdId={householdId}
      cards={cards}
      accounts={accounts}
      invoiceImports={invoiceImports}
      onCreated={refreshed}
    />

    <AppNav/>

    {editingAccount&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!savingBalance&&setEditingAccount(null)}>
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
