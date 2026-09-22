'use client';
import { useEffect, useMemo, useState } from 'react';
import { parseMoneyInputToMinor, type AccountType } from '@/src/core/accounts';
import { createHouseholdAccount } from '@/src/lib/repositories/accounts';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import type { FinancialScope } from '@/src/core/privacy';
import { useI18n } from '@/src/i18n/locale-provider';

export function AccountOnboarding({householdId,onCreated,variant='onboarding',defaultScope='household'}:{householdId:string;onCreated?:()=>void;variant?:'onboarding'|'compact';defaultScope?:FinancialScope}){
  const {locale,intlLocale,currency}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const currencySymbol=useMemo(()=>new Intl.NumberFormat(intlLocale,{style:'currency',currency,currencyDisplay:'narrowSymbol',minimumFractionDigits:0,maximumFractionDigits:0}).formatToParts(0).find(part=>part.type==='currency')?.value||currency,[intlLocale,currency]);
  const accountTypes=useMemo<Array<{value:AccountType;label:string;hint:string}>>(()=>[
    {value:'bank',label:l('Conta bancária','Bank account','Cuenta bancaria'),hint:l('Nubank, Itaú, Caixa…','Nubank, Itaú, Caixa…','Nubank, Itaú, Caixa…')},
    {value:'wallet',label:l('Carteira digital','Digital wallet','Billetera digital'),hint:l('Mercado Pago, PicPay…','Mercado Pago, PicPay…','Mercado Pago, PicPay…')},
    {value:'cash',label:l('Dinheiro','Cash','Efectivo'),hint:l('O que está em espécie','Money you have in cash','Lo que tienes en efectivo')}
  ],[locale]);
  const [open,setOpen]=useState(false);
  const [type,setType]=useState<AccountType>('bank');
  const [name,setName]=useState('');
  const [balance,setBalance]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [scope,setScope]=useState<FinancialScope>(defaultScope);
  useEffect(()=>{if(!open)setScope(defaultScope);},[defaultScope,open]);

  async function save(){
    const balanceMinor=parseMoneyInputToMinor(balance,locale);
    if(name.trim().length<2){
      setError(l('Dê um nome simples, como Nubank ou Dinheiro.','Give it a simple name, such as Nubank or Cash.','Ponle un nombre simple, como Nubank o Efectivo.'));
      return;
    }
    if(balanceMinor===null){
      setError(l('Digite o saldo atual, por exemplo 4820,00.','Enter the current balance, for example 4,820.00.','Escribe el saldo actual, por ejemplo 4820,00.'));
      return;
    }
    setSaving(true); setError('');
    try{
      await createHouseholdAccount({householdId,name:name.trim(),type,balanceMinor,scope});
      setOpen(false); setName(''); setBalance(''); setType('bank'); setScope(defaultScope);
      onCreated?.();
    }catch(err:any){
      setError(err?.message==='INVALID_BALANCE'
        ? l('Esse saldo parece incorreto.','That balance looks invalid.','Ese saldo parece incorrecto.')
        : l('Não conseguimos guardar essa conta agora.','We could not save this account right now.','No pudimos guardar esta cuenta ahora.'));
    }finally{setSaving(false);}
  }

  return <>
    {variant==='onboarding'
      ? <section className="first-money-card">
          <div>
            <span>{l('Comece por aqui','Start here','Empieza aquí')}</span>
            <h2>{l('Onde está seu dinheiro hoje?','Where is your money today?','¿Dónde está tu dinero hoy?')}</h2>
            <p>{l(
              'Adicione uma conta ou dinheiro em espécie. Depois disso, a Home já consegue mostrar quanto você realmente tem disponível.',
              'Add an account or cash. After that, Home can show how much you actually have available.',
              'Agrega una cuenta o efectivo. Después, Inicio podrá mostrar cuánto tienes realmente disponible.'
            )}</p>
          </div>
          <button className="primary-button" onClick={()=>setOpen(true)}>{l('Adicionar meu saldo','Add my balance','Agregar mi saldo')}</button>
        </section>
      : <button className="section-action account-compact-add" type="button" onClick={()=>setOpen(true)}>{l('Adicionar conta','Add account','Agregar cuenta')}</button>}

    {open&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setOpen(false)}>
      <section className="capture-sheet account-sheet" role="dialog" aria-modal="true" aria-label={l('Adicionar saldo','Add balance','Agregar saldo')}>
        <div className="sheet-handle"/>
        <div className="eyebrow">{l('Seu dinheiro hoje','Your money today','Tu dinero hoy')}</div>
        <h2>{l('Onde está esse saldo?','Where is this balance?','¿Dónde está este saldo?')}</h2>
        <p>{l(
          'Sem agência, conta ou dados bancários. Só o suficiente para o NestBalance organizar sua visão.',
          'No branch, account number or bank credentials. Only what NestBalance needs to organize your view.',
          'Sin sucursal, número de cuenta ni credenciales bancarias. Solo lo necesario para que NestBalance organice tu vista.'
        )}</p>

        <ScopeChoice value={scope} onChange={setScope} disabled={saving}/>

        <div className="account-type-grid">
          {accountTypes.map(item=><button type="button" key={item.value} className={type===item.value?'account-type active':'account-type'} onClick={()=>setType(item.value)}>
            <strong>{item.label}</strong><span>{item.hint}</span>
          </button>)}
        </div>

        <label className="field-label" htmlFor="account-name">{l('Como você chama essa conta?','What do you call this account?','¿Cómo llamas a esta cuenta?')}</label>
        <input id="account-name" className="premium-input" value={name} onChange={e=>setName(e.target.value)} placeholder={type==='cash'?l('Dinheiro','Cash','Efectivo'):l('Ex.: Nubank','E.g. Nubank','Ej.: Nubank')} maxLength={60}/>

        <label className="field-label" htmlFor="account-balance">{l('Quanto tem nela agora?','How much is in it now?','¿Cuánto hay en ella ahora?')}</label>
        <div className="money-input-wrap"><span>{currencySymbol}</span><input id="account-balance" inputMode="decimal" value={balance} onChange={e=>setBalance(e.target.value)} placeholder={locale==='en'?'0.00':'0,00'}/></div>
        <small className="field-help">{l('Pode ser negativo se essa conta estiver no vermelho.','It can be negative if this account is overdrawn.','Puede ser negativo si esta cuenta está en descubierto.')}</small>

        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={saving} onClick={()=>setOpen(false)}>{l('Agora não','Not now','Ahora no')}</button>
          <button className="primary-button" disabled={saving} onClick={save}>{saving?l('Guardando…','Saving…','Guardando…'):l('Guardar saldo','Save balance','Guardar saldo')}</button>
        </div>
      </section>
    </div>}
  </>;
}
