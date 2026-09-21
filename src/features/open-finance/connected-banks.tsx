'use client';
import { useEffect, useMemo, useState } from 'react';
import { OPEN_FINANCE_INSTITUTIONS, type OpenFinanceInstitutionKey } from '@/src/core/open-finance';
import {
  listOpenFinanceConnections,
  startOpenFinanceConnection,
  syncOpenFinanceConnection,
  type OpenFinanceConnection
} from '@/src/lib/repositories/open-finance';

const institutionCopy:Record<OpenFinanceInstitutionKey,{detail:string;badge?:string}>={
  mercado_pago:{detail:'Saldo e movimentações pelo Open Finance. Cofrinhos entram quando a fonte autorizada os expuser.',badge:'Prioridade'},
  nubank:{detail:'Conta, cartão, saldo e movimentações autorizadas.'},
  itau:{detail:'Conecte pelo seletor seguro do Open Finance.'},
  santander:{detail:'Conecte pelo seletor seguro do Open Finance.'},
  other:{detail:'Escolha outra instituição participante do Open Finance.'}
};

function statusText(connection:OpenFinanceConnection){
  if(connection.status==='ready') return `${connection.accountCount} conta${connection.accountCount===1?'':'s'} sincronizada${connection.accountCount===1?'':'s'}`;
  if(connection.status==='syncing') return 'Conectado · preparando dados';
  if(connection.status==='connected') return 'Conectado';
  if(connection.status==='needs_reauth') return 'Precisa renovar acesso';
  return 'Conexão registrada';
}

export function ConnectedBanks({
  householdId,
  onSynced
}:{
  householdId:string;
  onSynced?:()=>void;
}){
  const [connections,setConnections]=useState<OpenFinanceConnection[]>([]);
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [loading,setLoading]=useState(true);
  const [open,setOpen]=useState<OpenFinanceInstitutionKey|null>(null);
  const [legalName,setLegalName]=useState('');
  const [cpf,setCpf]=useState('');
  const [working,setWorking]=useState(false);
  const [syncing,setSyncing]=useState('');
  const [error,setError]=useState('');

  async function refresh(){
    try{
      const result=await listOpenFinanceConnections(householdId);
      setConfigured(result.configured);
      setConnections(result.connections);
      setError('');
    }catch{
      setError('Não conseguimos consultar suas conexões bancárias agora.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void refresh();},[householdId]);

  const connectedByKey=useMemo(()=>{
    const map=new Map<OpenFinanceInstitutionKey,OpenFinanceConnection>();
    for(const connection of connections){
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
      if(code==='INVALID_OPEN_FINANCE_IDENTITY') setError('Confira seu nome completo e CPF.');
      else if(code==='OPEN_FINANCE_NOT_CONFIGURED') setError('A conexão Open Finance está pronta no app, mas o provedor seguro ainda não foi ativado neste ambiente.');
      else setError('Não conseguimos iniciar a conexão agora. Nenhuma credencial bancária foi armazenada.');
      setWorking(false);
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
      setError('O banco está conectado, mas os dados ainda não ficaram disponíveis para atualização.');
    }finally{
      setSyncing('');
    }
  }

  return <section className="connected-banks-section">
    <div className="section-title">
      <div><h2>Contas conectadas</h2><span>saldo automático, com sua autorização</span></div>
      <span className="open-finance-badge">Open Finance</span>
    </div>

    <article className="open-finance-hero">
      <div>
        <span>SEM SENHA NO NESTBALANCE</span>
        <h3>Seu saldo pode se atualizar sozinho.</h3>
        <p>Você autoriza no ambiente seguro da instituição. O NestBalance recebe apenas os dados que você consentiu e transforma isso na sua visão financeira.</p>
      </div>
      <div className="open-finance-security">
        <strong>Você controla</strong>
        <span>conectar · atualizar · revogar</span>
      </div>
    </article>

    {loading
      ? <div className="home-loading-line" aria-label="Carregando bancos conectados"/>
      : <div className="institution-grid">
          {OPEN_FINANCE_INSTITUTIONS.filter(item=>item.key!=='other').map(item=>{
            const connection=connectedByKey.get(item.key);
            const copy=institutionCopy[item.key];
            return <article className={item.key==='mercado_pago'?'institution-card priority':'institution-card'} key={item.key}>
              <div className="institution-card-head">
                <div><strong>{item.name}</strong>{copy.badge&&<span>{copy.badge}</span>}</div>
                <i className={connection?'connection-dot connected':'connection-dot'} aria-hidden="true"/>
              </div>
              <p>{copy.detail}</p>
              {connection
                ? <div className="connected-bank-state">
                    <span>{statusText(connection)}</span>
                    <button type="button" disabled={syncing===connection.id} onClick={()=>void sync(connection)}>
                      {syncing===connection.id?'Atualizando…':'Atualizar agora'}
                    </button>
                  </div>
                : <button
                    type="button"
                    className="connect-bank-button"
                    disabled={configured===false}
                    onClick={()=>{setOpen(item.key);setError('');}}
                  >
                    {configured===false?'Integração em configuração':`Conectar ${item.name}`}
                  </button>}
            </article>;
          })}
        </div>}

    {connections.filter(item=>!['mercado_pago','nubank','itau','santander'].includes(item.institutionKey)).map(connection=>
      <div className="other-bank-connection" key={connection.id}>
        <div><strong>{connection.institutionName}</strong><span>{statusText(connection)}</span></div>
        <button type="button" disabled={syncing===connection.id} onClick={()=>void sync(connection)}>Atualizar</button>
      </div>
    )}

    {error&&!open&&<p className="error-copy" role="alert">{error}</p>}

    {open&&<div className="sheet-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!working&&setOpen(null)}>
      <section className="capture-sheet bank-connect-sheet" role="dialog" aria-modal="true" aria-label="Conectar conta bancária">
        <div className="sheet-handle"/>
        <div className="eyebrow">Open Finance</div>
        <h2>Conectar {OPEN_FINANCE_INSTITUTIONS.find(item=>item.key===open)?.name}</h2>
        <p>Esses dados servem apenas para iniciar seu consentimento. Seu CPF não é salvo no NestBalance, e sua senha bancária nunca passa por nós.</p>

        <div className="bank-consent-proof">
          <strong>Como funciona</strong>
          <span>1. Você confirma seus dados.</span>
          <span>2. Abre o ambiente seguro do Open Finance.</span>
          <span>3. Escolhe o que autoriza e por quanto tempo.</span>
          <span>4. O NestBalance importa somente o que foi permitido.</span>
        </div>

        <label className="field-label" htmlFor="of-name">Nome completo</label>
        <input id="of-name" className="premium-input" autoComplete="name" value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="Como está no banco" maxLength={120}/>

        <label className="field-label" htmlFor="of-cpf">CPF</label>
        <input id="of-cpf" className="premium-input" inputMode="numeric" autoComplete="off" value={cpf} onChange={e=>setCpf(formatCpfInput(e.target.value))} placeholder="000.000.000-00" maxLength={14}/>
        <small className="field-help">Usado na criação do consentimento e enviado diretamente ao provedor Open Finance. Não armazenamos o número.</small>

        {error&&<p className="error-copy" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="ghost-button" disabled={working} onClick={()=>setOpen(null)}>Cancelar</button>
          <button className="primary-button" disabled={working||legalName.trim().length<3||cpf.replace(/\D/g,'').length!==11} onClick={()=>void connect()}>
            {working?'Abrindo conexão segura…':'Continuar com segurança'}
          </button>
        </div>
      </section>
    </div>}
  </section>;
}
