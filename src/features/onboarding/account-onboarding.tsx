'use client';
import { useState } from 'react';
import { parseMoneyInputToMinor, type AccountType } from '@/src/core/accounts';
import { createHouseholdAccount } from '@/src/lib/repositories/accounts';

const accountTypes:{value:AccountType;label:string;hint:string}[]=[
  {value:'bank',label:'Conta bancária',hint:'Nubank, Itaú, Caixa…'},
  {value:'wallet',label:'Carteira digital',hint:'Mercado Pago, PicPay…'},
  {value:'cash',label:'Dinheiro',hint:'O que está em espécie'}
];

export function AccountOnboarding({householdId,onCreated}:{householdId:string;onCreated?:()=>void}){
  const [open,setOpen]=useState(false);
  const [type,setType]=useState<AccountType>('bank');
  const [name,setName]=useState('');
  const [balance,setBalance]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  async function save(){
    const balanceMinor=parseMoneyInputToMinor(balance);
    if(name.trim().length<2){
      setError('Dê um nome simples, como Nubank ou Dinheiro.');
      return;
    }
    if(balanceMinor===null){
      setError('Digite o saldo atual, por exemplo 4820,00.');
      return;
    }
    setSaving(true); setError('');
    try{
      await createHouseholdAccount({householdId,name:name.trim(),type,balanceMinor});
      setOpen(false); setName(''); setBalance(''); setType('bank');
      onCreated?.();
    }catch(err:any){
      setError(err?.message==='INVALID_BALANCE'?'Esse saldo parece incorreto.':'Não conseguimos guardar essa conta agora.');
    }finally{setSaving(false);}
  }

  return <>
    <section className="first-money-card">
      <div>
        <span>Comece por aqui</span>
        <h2>Onde está seu dinheiro hoje?</h2>
        <p>Adicione uma conta ou dinheiro em espécie. Depois disso, a Home já consegue mostrar quanto você realmente tem disponível.</p>
      </div>
      <button className="primary-button" onClick={()=>setOpen(true)}>Adicionar meu saldo</button>
    </section>

    {open&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setOpen(false)}>
      <section className="capture-sheet account-sheet" role="dialog" aria-modal="true" aria-label="Adicionar saldo">
        <div className="sheet-handle"/>
        <div className="eyebrow">Seu dinheiro hoje</div>
        <h2>Onde está esse saldo?</h2>
        <p>Sem agência, conta ou dados bancários. Só o suficiente para o NestBalance organizar sua visão.</p>

        <div className="account-type-grid">
          {accountTypes.map(item=><button type="button" key={item.value} className={type===item.value?'account-type active':'account-type'} onClick={()=>setType(item.value)}>
            <strong>{item.label}</strong><span>{item.hint}</span>
          </button>)}
        </div>

        <label className="field-label" htmlFor="account-name">Como você chama essa conta?</label>
        <input id="account-name" className="premium-input" value={name} onChange={e=>setName(e.target.value)} placeholder={type==='cash'?'Dinheiro':'Ex.: Nubank'} maxLength={60}/>

        <label className="field-label" htmlFor="account-balance">Quanto tem nela agora?</label>
        <div className="money-input-wrap"><span>R$</span><input id="account-balance" inputMode="decimal" value={balance} onChange={e=>setBalance(e.target.value)} placeholder="0,00"/></div>
        <small className="field-help">Pode ser negativo se essa conta estiver no vermelho.</small>

        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={saving} onClick={()=>setOpen(false)}>Agora não</button>
          <button className="primary-button" disabled={saving} onClick={save}>{saving?'Guardando…':'Guardar saldo'}</button>
        </div>
      </section>
    </div>}
  </>;
}
