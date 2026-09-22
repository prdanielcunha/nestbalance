'use client';
import { useEffect, useMemo, useState } from 'react';
import { parseMoneyInputToMinor, type AccountType } from '@/src/core/accounts';
import { createHouseholdAccount } from '@/src/lib/repositories/accounts';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import type { FinancialScope } from '@/src/core/privacy';
import { useAppLocale } from '@/src/i18n/locale-provider';

const copy={
  'pt-BR':{
    bank:'Conta bancária',bankHint:'Nubank, Itaú, Caixa…',wallet:'Carteira digital',walletHint:'Mercado Pago, PicPay…',cash:'Dinheiro',cashHint:'O que está em espécie',
    nameError:'Dê um nome simples, como Nubank ou Dinheiro.',balanceError:'Digite o saldo atual, por exemplo 4820,00.',invalidBalance:'Esse saldo parece incorreto.',saveError:'Não conseguimos guardar essa conta agora.',
    start:'Comece por aqui',whereMoney:'Onde está seu dinheiro hoje?',intro:'Adicione uma conta ou dinheiro em espécie. Depois disso, a Home já consegue mostrar quanto você realmente tem disponível.',
    addBalance:'Adicionar meu saldo',addAccount:'Adicionar conta',dialog:'Adicionar saldo',today:'Seu dinheiro hoje',where:'Onde está esse saldo?',privacy:'Sem agência, conta ou dados bancários. Só o suficiente para o NestBalance organizar sua visão.',
    accountName:'Como você chama essa conta?',cashPlaceholder:'Dinheiro',example:'Ex.: Nubank',amount:'Quanto tem nela agora?',negative:'Pode ser negativo se essa conta estiver no vermelho.',
    later:'Agora não',saving:'Guardando…',save:'Guardar saldo'
  },
  en:{
    bank:'Bank account',bankHint:'Nubank, Itaú, Caixa…',wallet:'Digital wallet',walletHint:'Mercado Pago, PicPay…',cash:'Cash',cashHint:'Money you keep in cash',
    nameError:'Give it a simple name, such as Nubank or Cash.',balanceError:'Enter the current balance, for example 4820.00.',invalidBalance:'That balance does not look valid.',saveError:'We could not save this account right now.',
    start:'Start here',whereMoney:'Where is your money today?',intro:'Add an account or cash. After that, Home can already show how much money is actually available.',
    addBalance:'Add my balance',addAccount:'Add account',dialog:'Add balance',today:'Your money today',where:'Where is this balance?',privacy:'No branch, account number, or banking credentials. Only what NestBalance needs to organize your view.',
    accountName:'What do you call this account?',cashPlaceholder:'Cash',example:'E.g. Nubank',amount:'How much is in it now?',negative:'It can be negative if this account is overdrawn.',
    later:'Not now',saving:'Saving…',save:'Save balance'
  },
  es:{
    bank:'Cuenta bancaria',bankHint:'Nubank, Itaú, Caixa…',wallet:'Billetera digital',walletHint:'Mercado Pago, PicPay…',cash:'Efectivo',cashHint:'Lo que tienes en efectivo',
    nameError:'Ponle un nombre simple, como Nubank o Efectivo.',balanceError:'Ingresa el saldo actual, por ejemplo 4820,00.',invalidBalance:'Ese saldo no parece válido.',saveError:'No pudimos guardar esta cuenta ahora.',
    start:'Empieza por aquí',whereMoney:'¿Dónde está tu dinero hoy?',intro:'Agrega una cuenta o efectivo. Después, Inicio ya puede mostrar cuánto tienes realmente disponible.',
    addBalance:'Agregar mi saldo',addAccount:'Agregar cuenta',dialog:'Agregar saldo',today:'Tu dinero hoy',where:'¿Dónde está este saldo?',privacy:'Sin sucursal, número de cuenta ni credenciales bancarias. Solo lo necesario para que NestBalance organice tu visión.',
    accountName:'¿Cómo llamas a esta cuenta?',cashPlaceholder:'Efectivo',example:'Ej.: Nubank',amount:'¿Cuánto hay ahora?',negative:'Puede ser negativo si esta cuenta está sobregirada.',
    later:'Ahora no',saving:'Guardando…',save:'Guardar saldo'
  }
} as const;

export function AccountOnboarding({householdId,onCreated,variant='onboarding',defaultScope='household'}:{householdId:string;onCreated?:()=>void;variant?:'onboarding'|'compact';defaultScope?:FinancialScope}){
  const {locale}=useAppLocale();
  const c=copy[locale];
  const accountTypes=useMemo(()=>[
    {value:'bank' as AccountType,label:c.bank,hint:c.bankHint},
    {value:'wallet' as AccountType,label:c.wallet,hint:c.walletHint},
    {value:'cash' as AccountType,label:c.cash,hint:c.cashHint}
  ],[c]);
  const [open,setOpen]=useState(false);
  const [type,setType]=useState<AccountType>('bank');
  const [name,setName]=useState('');
  const [balance,setBalance]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [scope,setScope]=useState<FinancialScope>(defaultScope);
  useEffect(()=>{if(!open)setScope(defaultScope);},[defaultScope,open]);

  async function save(){
    const balanceMinor=parseMoneyInputToMinor(balance);
    if(name.trim().length<2){ setError(c.nameError); return; }
    if(balanceMinor===null){ setError(c.balanceError); return; }
    setSaving(true); setError('');
    try{
      await createHouseholdAccount({householdId,name:name.trim(),type,balanceMinor,scope});
      setOpen(false); setName(''); setBalance(''); setType('bank'); setScope(defaultScope);
      onCreated?.();
    }catch(err:any){
      setError(err?.message==='INVALID_BALANCE'?c.invalidBalance:c.saveError);
    }finally{setSaving(false);}
  }

  return <>
    {variant==='onboarding'
      ? <section className="first-money-card">
          <div>
            <span>{c.start}</span>
            <h2>{c.whereMoney}</h2>
            <p>{c.intro}</p>
          </div>
          <button className="primary-button" onClick={()=>setOpen(true)}>{c.addBalance}</button>
        </section>
      : <button className="section-action account-compact-add" type="button" onClick={()=>setOpen(true)}>{c.addAccount}</button>}

    {open&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setOpen(false)}>
      <section className="capture-sheet account-sheet" role="dialog" aria-modal="true" aria-label={c.dialog}>
        <div className="sheet-handle"/>
        <div className="eyebrow">{c.today}</div>
        <h2>{c.where}</h2>
        <p>{c.privacy}</p>

        <ScopeChoice value={scope} onChange={setScope} disabled={saving}/>

        <div className="account-type-grid">
          {accountTypes.map(item=><button type="button" key={item.value} className={type===item.value?'account-type active':'account-type'} onClick={()=>setType(item.value)}>
            <strong>{item.label}</strong><span>{item.hint}</span>
          </button>)}
        </div>

        <label className="field-label" htmlFor="account-name">{c.accountName}</label>
        <input id="account-name" className="premium-input" value={name} onChange={e=>setName(e.target.value)} placeholder={type==='cash'?c.cashPlaceholder:c.example} maxLength={60}/>

        <label className="field-label" htmlFor="account-balance">{c.amount}</label>
        <div className="money-input-wrap"><span>R$</span><input id="account-balance" inputMode="decimal" value={balance} onChange={e=>setBalance(e.target.value)} placeholder="0,00"/></div>
        <small className="field-help">{c.negative}</small>

        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={saving} onClick={()=>setOpen(false)}>{c.later}</button>
          <button className="primary-button" disabled={saving} onClick={save}>{saving?c.saving:c.save}</button>
        </div>
      </section>
    </div>}
  </>;
}
