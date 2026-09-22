'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OPEN_FINANCE_INSTITUTIONS, type OpenFinanceInstitutionKey } from '@/src/core/open-finance';
import type { HomeAccount } from '@/src/lib/repositories/home';
import {
  disconnectOpenFinanceConnection,
  listOpenFinanceConnections,
  startOpenFinanceConnection,
  syncOpenFinanceConnection,
  type OpenFinanceConnection
} from '@/src/lib/repositories/open-finance';
import { useI18n } from '@/src/i18n/locale-provider';

export function ConnectedBanks({
  householdId,
  accounts,
  onSynced
}:{
  householdId:string;
  accounts:HomeAccount[];
  onSynced?:()=>void;
}){
  const {locale,formatMoney}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const institutionCopy=useMemo<Record<OpenFinanceInstitutionKey,{detail:string;badge?:string}>>(()=>({
    mercado_pago:{
      detail:l(
        'Saldo e movimentações pelo Open Finance. Cofrinhos entram quando a fonte autorizada os expuser.',
        'Balance and transactions through Open Finance. Savings pockets appear when the authorized source exposes them.',
        'Saldo y movimientos por Open Finance. Los bolsillos de ahorro aparecen cuando la fuente autorizada los expone.'
      ),
      badge:l('Prioridade','Priority','Prioridad')
    },
    nubank:{detail:l('Conta, cartão, saldo e movimentações autorizadas.','Authorized account, card, balance and transactions.','Cuenta, tarjeta, saldo y movimientos autorizados.')},
    itau:{detail:l('Conta, cartão e movimentações autorizadas pelo Open Finance.','Account, card and transactions authorized through Open Finance.','Cuenta, tarjeta y movimientos autorizados por Open Finance.')},
    santander:{detail:l('Conta, cartão e movimentações autorizadas pelo Open Finance.','Account, card and transactions authorized through Open Finance.','Cuenta, tarjeta y movimientos autorizados por Open Finance.')},
    other:{detail:l('Escolha outra instituição participante do Open Finance.','Choose another institution that participates in Open Finance.','Elige otra institución participante de Open Finance.')}
  }),[locale]);

  const [connections,setConnections]=useState<OpenFinanceConnection[]>([]);
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [loading,setLoading]=useState(true);
  const [open,setOpen]=useState<OpenFinanceInstitutionKey|null>(null);
  const [legalName,setLegalName]=useState('');
  const [cpf,setCpf]=useState('');
  const [working,setWorking]=useState(false);
  const [syncing,setSyncing]=useState('');
  const [disconnectTarget,setDisconnectTarget]=useState<OpenFinanceConnection|null>(null);
  const [disconnecting,setDisconnecting]=useState(false);
  const [error,setError]=useState('');

  function statusText(connection:OpenFinanceConnection){
    if(connection.status==='ready') return l(
      `${connection.accountCount} conta${connection.accountCount===1?'':'s'} sincronizada${connection.accountCount===1?'':'s'}`,
      `${connection.accountCount} synced account${connection.accountCount===1?'':'s'}`,
      `${connection.accountCount} cuenta${connection.accountCount===1?'':'s'} sincronizada${connection.accountCount===1?'':'s'}`
    );
    if(connection.status==='syncing') return l('Conectado · preparando dados','Connected · preparing data','Conectado · preparando datos');
    if(connection.status==='connected') return l('Conectado','Connected','Conectado');
    if(connection.status==='needs_reauth') return l('Precisa renovar acesso','Access renewal required','Necesita renovar el acceso');
    return l('Conexão registrada','Connection registered','Conexión registrada');
  }

  async function refresh(){
    try{
      const result=await listOpenFinanceConnections(householdId);
      setConfigured(result.configured);
      setConnections(result.connections);
      setError('');
    }catch{
      setError(l('Não conseguimos consultar suas conexões bancárias agora.','We could not check your bank connections right now.','No pudimos consultar tus conexiones bancarias ahora.'));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void refresh();},[householdId]);

  const accountsByConnection=useMemo(()=>{
    const map=new Map<string,HomeAccount[]>();
    for(const account of accounts){
      if(!account.connectionId) continue;
      const list=map.get(account.connectionId)??[];
      list.push(account);
      map.set(account.connectionId,list);
    }
    return map;
  },[accounts]);

  const connectedByKey=useMemo(()=>{
    const map=new Map<OpenFinanceInstitutionKey,OpenFinanceConnection>();
    for(const connection of connections){
      if(connection.status==='disconnected') continue;
      if(!map.has(connection.institutionKey)) map.set(connection.institutionKey,connection);
    }
    return map;
  },[connections]);

  function formatCpfInput(value:string){
    const digits=value.replace(/\D/g,'').slice(0,11);
    return digits
      .replace(/^(\d{3})(\d)/,'$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3')
      .replace(/\.(\d{3})(\d)/,'.$1-$2');
  }

  async function connect(){
    if(!open||working) return;
    setWorking(true);
    setError('');
    try{
      const result=await startOpenFinanceConnection({
        householdId,
        institutionKey:open,
        legalName,
        cpf,
        returnOrigin:window.location.origin+'/'
      });
      window.location.assign(result.widgetUrl);
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='INVALID_OPEN_FINANCE_IDENTITY') setError(l('Confira seu nome completo e CPF.','Check your full name and CPF.','Revisa tu nombre completo y CPF.'));
      else if(code==='OPEN_FINANCE_NOT_CONFIGURED') setError(l(
        'A conexão Open Finance está pronta no app, mas o provedor seguro ainda não foi ativado neste ambiente.',
        'Open Finance support is ready in the app, but the secure provider has not been enabled in this environment.',
        'La conexión Open Finance está lista en la app, pero el proveedor seguro aún no está habilitado en este entorno.'
      ));
      else setError(l(
        'Não conseguimos iniciar a conexão agora. Nenhuma credencial bancária foi armazenada.',
        'We could not start the connection right now. No bank credentials were stored.',
        'No pudimos iniciar la conexión ahora. No se almacenó ninguna credencial bancaria.'
      ));
      setWorking(false);
    }
  }

  async function disconnect(){
    if(!disconnectTarget||disconnecting) return;
    setDisconnecting(true);
    setError('');
    try{
      await disconnectOpenFinanceConnection({
        householdId,
        connectionId:disconnectTarget.id
      });
      setDisconnectTarget(null);
      await refresh();
      onSynced?.();
    }catch{
      setError(l(
        'Não conseguimos revogar essa conexão agora. O saldo conectado não foi removido.',
        'We could not revoke this connection right now. The connected balance was not removed.',
        'No pudimos revocar esta conexión ahora. El saldo conectado no fue eliminado.'
      ));
    }finally{
      setDisconnecting(false);
    }
  }

  async function sync(connection:OpenFinanceConnection){
    if(syncing) return;
    setSyncing(connection.id);
    setError('');
    try{
      await syncOpenFinanceConnection({householdId,connectionId:connection.id});
      await refresh();
      onSynced?.();
    }catch{
      setError(l(
        'O banco está conectado, mas os dados ainda não ficaram disponíveis para atualização.',
        'The bank is connected, but the data is not available for refresh yet.',
        'El banco está conectado, pero los datos todavía no están disponibles para actualizar.'
      ));
    }finally{
      setSyncing('');
    }
  }

  const hasActiveConnections=connections.some(item=>item.status!=='disconnected');
  if(!loading&&configured===false&&!hasActiveConnections){
    return <section className="connected-banks-section">
      <div className="section-title">
        <div><h2>{l('Atualização automática','Automatic updates','Actualización automática')}</h2><span>{l('opcional — o app funciona sem isso','optional — the app works without it','opcional — la app funciona sin esto')}</span></div>
        <span className="open-finance-badge">Open Finance</span>
      </div>
      <article className="open-finance-hero">
        <div>
          <span>{l('SEM INTEGRAÇÃO PAGA OBRIGATÓRIA','NO REQUIRED PAID INTEGRATION','SIN INTEGRACIÓN PAGA OBLIGATORIA')}</span>
          <h3>{l('Open Finance não está ativado nesta versão.','Open Finance is not enabled in this version.','Open Finance no está habilitado en esta versión.')}</h3>
          <p>{l(
            'O NestBalance continua funcionando com cadastro manual e importação de arquivos. A conexão automática fica desligada enquanto depender de um provedor pago.',
            'NestBalance keeps working with manual accounts and file imports. Automatic connection stays off while it depends on a paid provider.',
            'NestBalance sigue funcionando con cuentas manuales e importación de archivos. La conexión automática permanece desactivada mientras dependa de un proveedor pago.'
          )}</p>
        </div>
        <div className="open-finance-security">
          <strong>{l('Você não precisa conectar banco','You do not need to connect a bank','No necesitas conectar un banco')}</strong>
          <span>{l('Use conta manual, PDF, CSV ou seus próprios comprovantes.','Use a manual account, PDF, CSV or your own receipts.','Usa una cuenta manual, PDF, CSV o tus propios comprobantes.')}</span>
          <Link href="/add" className="connect-bank-button">{l('Adicionar sem conectar banco','Add without connecting a bank','Agregar sin conectar un banco')}</Link>
        </div>
      </article>
    </section>;
  }

  return <section className="connected-banks-section">
    <div className="section-title">
      <div><h2>{l('Contas conectadas','Connected accounts','Cuentas conectadas')}</h2><span>{l('saldo automático, com sua autorização','automatic balance, with your authorization','saldo automático, con tu autorización')}</span></div>
      <span className="open-finance-badge">Open Finance</span>
    </div>

    <article className="open-finance-hero">
      <div>
        <span>{l('SEM SENHA NO NESTBALANCE','NO BANK PASSWORD IN NESTBALANCE','SIN CONTRASEÑA BANCARIA EN NESTBALANCE')}</span>
        <h3>{l('Seu saldo pode se atualizar sozinho.','Your balance can refresh automatically.','Tu saldo puede actualizarse automáticamente.')}</h3>
        <p>{l(
          'Você autoriza no ambiente seguro da instituição. O NestBalance recebe apenas os dados que você consentiu e transforma isso na sua visão financeira.',
          'You authorize access in the institution’s secure environment. NestBalance receives only the data you consented to and turns it into your financial view.',
          'Tú autorizas en el entorno seguro de la institución. NestBalance recibe solo los datos que consentiste y los transforma en tu visión financiera.'
        )}</p>
      </div>
      <div className="open-finance-security">
        <strong>{l('Você controla','You stay in control','Tú tienes el control')}</strong>
        <span>{l('conectar · atualizar · revogar','connect · refresh · revoke','conectar · actualizar · revocar')}</span>
      </div>
    </article>

    {loading
      ? <div className="home-loading-line" aria-label={l('Carregando bancos conectados','Loading connected banks','Cargando bancos conectados')}/>
      : <div className="institution-grid">
          {OPEN_FINANCE_INSTITUTIONS.filter(item=>item.key!=='other').map(item=>{
            const connection=connectedByKey.get(item.key);
            const copy=institutionCopy[item.key];
            const linkedAccounts=connection?accountsByConnection.get(connection.id)??[]:[];
            const spendableMinor=linkedAccounts
              .filter(account=>account.connectedProductType!=='investment')
              .reduce((sum,account)=>sum+account.balanceMinor,0);
            const investmentsMinor=linkedAccounts
              .filter(account=>account.connectedProductType==='investment')
              .reduce((sum,account)=>sum+account.balanceMinor,0);
            const autoInvestedMinor=linkedAccounts
              .reduce((sum,account)=>sum+Number(account.automaticallyInvestedMinor||0),0);
            return <article className={item.key==='mercado_pago'?'institution-card priority':'institution-card'} key={item.key}>
              <div className="institution-card-head">
                <div><strong>{item.name}</strong>{copy.badge&&<span>{copy.badge}</span>}</div>
                <i className={connection?'connection-dot connected':'connection-dot'} aria-hidden="true"/>
              </div>
              <p>{copy.detail}</p>
              {connection
                ? <div className="connected-bank-state">
                    <span>{statusText(connection)}</span>
                    {linkedAccounts.length>0&&<div className="connected-bank-money">
                      <div><small>{l('Disponível','Available','Disponible')}</small><strong>{formatMoney(spendableMinor)}</strong></div>
                      {investmentsMinor>0&&<div><small>{l('Investimentos','Investments','Inversiones')}</small><strong>{formatMoney(investmentsMinor)}</strong></div>}
                      {autoInvestedMinor>0&&<div><small>{l('Aplicado automaticamente','Automatically invested','Invertido automáticamente')}</small><strong>{formatMoney(autoInvestedMinor)}</strong></div>}
                    </div>}
                    <div className="connected-bank-actions">
                      <button type="button" disabled={syncing===connection.id} onClick={()=>void sync(connection)}>
                        {syncing===connection.id?l('Atualizando…','Refreshing…','Actualizando…'):l('Atualizar agora','Refresh now','Actualizar ahora')}
                      </button>
                      <button type="button" className="disconnect-bank-button" disabled={Boolean(syncing)} onClick={()=>setDisconnectTarget(connection)}>
                        {l('Desconectar','Disconnect','Desconectar')}
                      </button>
                    </div>
                  </div>
                : <button
                    type="button"
                    className="connect-bank-button"
                    disabled={configured===false}
                    onClick={()=>{setOpen(item.key);setError('');}}
                  >
                    {configured===false
                      ? l('Integração em configuração','Integration being configured','Integración en configuración')
                      : l(`Conectar ${item.name}`,`Connect ${item.name}`,`Conectar ${item.name}`)}
                  </button>}
            </article>;
          })}
        </div>}

    {connections.filter(item=>item.status!=='disconnected'&&!['mercado_pago','nubank','itau','santander'].includes(item.institutionKey)).map(connection=>
      <div className="other-bank-connection" key={connection.id}>
        <div><strong>{connection.institutionName}</strong><span>{statusText(connection)}</span></div>
        <button type="button" disabled={syncing===connection.id} onClick={()=>void sync(connection)}>{l('Atualizar','Refresh','Actualizar')}</button>
      </div>
    )}

    {error&&!open&&<p className="error-copy" role="alert">{error}</p>}

    {disconnectTarget&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!disconnecting&&setDisconnectTarget(null)}>
      <section className="capture-sheet bank-disconnect-sheet" role="dialog" aria-modal="true" aria-label={l('Desconectar instituição','Disconnect institution','Desconectar institución')}>
        <div className="sheet-handle"/>
        <div className="eyebrow">{l('Sua autorização','Your authorization','Tu autorización')}</div>
        <h2>{l(`Desconectar ${disconnectTarget.institutionName}?`,`Disconnect ${disconnectTarget.institutionName}?`,`¿Desconectar ${disconnectTarget.institutionName}?`)}</h2>
        <p>{l(
          'O NestBalance vai parar de atualizar essa instituição e remover suas contas conectadas do saldo atual. Seu histórico já importado continua no Lar para não apagar sua vida financeira.',
          'NestBalance will stop refreshing this institution and remove its connected accounts from your current balance. Previously imported history stays in the Household so your financial history is not erased.',
          'NestBalance dejará de actualizar esta institución y quitará sus cuentas conectadas del saldo actual. El historial ya importado permanece en el Hogar para no borrar tu vida financiera.'
        )}</p>
        <div className="bank-revoke-note">
          <strong>{l('O consentimento também será revogado.','Consent will also be revoked.','El consentimiento también será revocado.')}</strong>
          <span>{l(
            'A conexão do provedor é excluída junto com os dados mantidos por ele para esse vínculo.',
            'The provider connection is deleted together with the data it keeps for this link.',
            'La conexión del proveedor se elimina junto con los datos que mantiene para este vínculo.'
          )}</span>
        </div>
        <div className="sheet-actions">
          <button className="ghost-button" disabled={disconnecting} onClick={()=>setDisconnectTarget(null)}>{l('Manter conectado','Keep connected','Mantener conectado')}</button>
          <button className="danger-button" disabled={disconnecting} onClick={()=>void disconnect()}>
            {disconnecting?l('Desconectando…','Disconnecting…','Desconectando…'):l('Desconectar e revogar','Disconnect and revoke','Desconectar y revocar')}
          </button>
        </div>
      </section>
    </div>}

    {open&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!working&&setOpen(null)}>
      <section className="capture-sheet bank-connect-sheet" role="dialog" aria-modal="true" aria-label={l('Conectar conta bancária','Connect bank account','Conectar cuenta bancaria')}>
        <div className="sheet-handle"/>
        <div className="eyebrow">Open Finance</div>
        <h2>{l(
          `Conectar ${OPEN_FINANCE_INSTITUTIONS.find(item=>item.key===open)?.name}`,
          `Connect ${OPEN_FINANCE_INSTITUTIONS.find(item=>item.key===open)?.name}`,
          `Conectar ${OPEN_FINANCE_INSTITUTIONS.find(item=>item.key===open)?.name}`
        )}</h2>
        <p>{l(
          'Esses dados servem apenas para iniciar seu consentimento. Seu CPF não é salvo no NestBalance, e sua senha bancária nunca passa por nós.',
          'These details are used only to start your consent. Your CPF is not stored in NestBalance, and your bank password never passes through us.',
          'Estos datos se usan solo para iniciar tu consentimiento. Tu CPF no se guarda en NestBalance y tu contraseña bancaria nunca pasa por nosotros.'
        )}</p>

        <div className="bank-consent-proof">
          <strong>{l('Como funciona','How it works','Cómo funciona')}</strong>
          <span>{l('1. Você confirma seus dados.','1. You confirm your details.','1. Confirmas tus datos.')}</span>
          <span>{l('2. Abre o ambiente seguro do Open Finance.','2. The secure Open Finance environment opens.','2. Se abre el entorno seguro de Open Finance.')}</span>
          <span>{l('3. Escolhe o que autoriza e por quanto tempo.','3. You choose what to authorize and for how long.','3. Eliges qué autorizar y por cuánto tiempo.')}</span>
          <span>{l('4. O NestBalance importa somente o que foi permitido.','4. NestBalance imports only what you allowed.','4. NestBalance importa solo lo que permitiste.')}</span>
        </div>

        <label className="field-label" htmlFor="of-name">{l('Nome completo','Full name','Nombre completo')}</label>
        <input id="of-name" className="premium-input" autoComplete="name" value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder={l('Como está no banco','As it appears at the bank','Como aparece en el banco')} maxLength={120}/>

        <label className="field-label" htmlFor="of-cpf">CPF</label>
        <input id="of-cpf" className="premium-input" inputMode="numeric" autoComplete="off" value={cpf} onChange={e=>setCpf(formatCpfInput(e.target.value))} placeholder="000.000.000-00" maxLength={14}/>
        <small className="field-help">{l(
          'Usado na criação do consentimento e enviado diretamente ao provedor Open Finance. Não armazenamos o número.',
          'Used to create consent and sent directly to the Open Finance provider. We do not store the number.',
          'Se usa para crear el consentimiento y se envía directamente al proveedor Open Finance. No almacenamos el número.'
        )}</small>

        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={working} onClick={()=>setOpen(null)}>{l('Cancelar','Cancel','Cancelar')}</button>
          <button className="primary-button" disabled={working||legalName.trim().length<3||cpf.replace(/\D/g,'').length!==11} onClick={()=>void connect()}>
            {working?l('Abrindo conexão segura…','Opening secure connection…','Abriendo conexión segura…'):l('Continuar com segurança','Continue securely','Continuar de forma segura')}
          </button>
        </div>
      </section>
    </div>}
  </section>;
}
