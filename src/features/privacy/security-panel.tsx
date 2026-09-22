'use client';
import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/lib/firebase/client';
import { loadSecurityDevices, revokeAllNestBalanceSessions, type SecurityDevice } from '@/src/lib/repositories/security';
import { useI18n } from '@/src/i18n/locale-provider';

export function SecurityPanel(){
  const {locale,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [devices,setDevices]=useState<SecurityDevice[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [confirming,setConfirming]=useState(false);
  const [revoking,setRevoking]=useState(false);

  useEffect(()=>{
    let active=true;
    void loadSecurityDevices()
      .then(result=>{if(active){setDevices(result.devices);setError('');}})
      .catch(()=>{if(active)setError(l('Não conseguimos carregar seus dispositivos agora.','We could not load your devices right now.','No pudimos cargar tus dispositivos ahora.'));})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);

  async function revoke(){
    if(revoking) return;
    setRevoking(true);setError('');
    try{
      await revokeAllNestBalanceSessions();
      if(auth) await signOut(auth);
      window.location.assign('/');
    }catch{
      setError(l('Não conseguimos encerrar as sessões agora. Nenhum outro app da MillionsNest foi alterado.','We could not end the sessions right now. No other MillionsNest app was changed.','No pudimos cerrar las sesiones ahora. Ninguna otra app de MillionsNest fue modificada.'));
      setRevoking(false);
      setConfirming(false);
    }
  }

  return <section className="privacy-security-section">
    <div className="section-title"><div>
      <h2>{l('Segurança e dispositivos','Security & devices','Seguridad y dispositivos')}</h2>
      <span>{l('transparência sem rastreamento invasivo','transparency without invasive tracking','transparencia sin rastreo invasivo')}</span>
    </div></div>
    <div className="security-grid">
      <article className="privacy-card security-device-card">
        <span>{l('DISPOSITIVOS','DEVICES','DISPOSITIVOS')}</span>
        <h3>{l('Onde o NestBalance foi aberto','Where NestBalance has been opened','Dónde se abrió NestBalance')}</h3>
        <p>{l(
          'Guardamos somente um identificador aleatório protegido e um rótulo genérico do aparelho. Não usamos isso para rastrear sua localização.',
          'We store only a protected random identifier and a generic device label. We do not use it to track your location.',
          'Guardamos solo un identificador aleatorio protegido y una etiqueta genérica del dispositivo. No lo usamos para rastrear tu ubicación.'
        )}</p>
        {loading&&<div className="security-device-loading" role="status">{l('Carregando dispositivos…','Loading devices…','Cargando dispositivos…')}</div>}
        {!loading&&devices.length===0&&<p className="security-empty">{l('Nenhum dispositivo recente foi encontrado.','No recent device was found.','No se encontró ningún dispositivo reciente.')}</p>}
        {!loading&&devices.length>0&&<div className="security-device-list">
          {devices.map(device=><div className="security-device-row" key={device.id}>
            <div>
              <strong>{device.label}{device.current?' · '+l('este aparelho','this device','este dispositivo'):''}</strong>
              <small>{device.lastSeenAtMs
                ? l('Visto ','Seen ','Visto ')+formatDate(device.lastSeenAtMs,{dateStyle:'medium',timeStyle:'short'})
                : l('Uso recente registrado','Recent use recorded','Uso reciente registrado')}</small>
            </div>
            {device.revokedAtMs&&<span className="security-status">{l('encerrado','ended','cerrado')}</span>}
          </div>)}
        </div>}
      </article>

      <article className="privacy-card security-session-card">
        <span>{l('SESSÕES','SESSIONS','SESIONES')}</span>
        <h3>{l('Encerrar acesso ao NestBalance','End NestBalance access','Cerrar acceso a NestBalance')}</h3>
        <p>{l(
          'Use isto se perder um aparelho ou desconfiar de um acesso. O corte vale somente para o NestBalance e não desconecta outros produtos da MillionsNest.',
          'Use this if you lose a device or suspect access. The cutoff applies only to NestBalance and does not sign you out of other MillionsNest products.',
          'Úsalo si pierdes un dispositivo o sospechas de un acceso. El cierre se aplica solo a NestBalance y no cierra sesión en otros productos de MillionsNest.'
        )}</p>
        {!confirming
          ? <button className="ghost-button" onClick={()=>setConfirming(true)}>{l('Encerrar em todos os aparelhos','End on all devices','Cerrar en todos los dispositivos')}</button>
          : <div className="security-confirm">
              <p>{l(
                'Você também sairá deste aparelho e precisará entrar novamente.',
                'You will also be signed out on this device and will need to sign in again.',
                'También se cerrará la sesión en este dispositivo y tendrás que entrar de nuevo.'
              )}</p>
              <div className="privacy-actions">
                <button className="ghost-button" disabled={revoking} onClick={()=>setConfirming(false)}>{l('Cancelar','Cancel','Cancelar')}</button>
                <button className="danger-button" disabled={revoking} onClick={()=>void revoke()}>{revoking?l('Encerrando…','Ending…','Cerrando…'):l('Confirmar e sair','Confirm & sign out','Confirmar y salir')}</button>
              </div>
            </div>}
      </article>
    </div>
    {error&&<p className="error-copy" role="alert">{error}</p>}
  </section>;
}
