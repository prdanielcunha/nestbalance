'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/src/i18n/locale-provider';

type InstallPromptEvent=Event&{
  prompt:()=>Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>;
};

export function PwaInstallCard(){
  const {locale}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const [ios,setIos]=useState(false);
  const [installed,setInstalled]=useState(true);

  useEffect(()=>{
    const nav=navigator as Navigator&{standalone?:boolean};
    const standalone=nav.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches===true;
    setInstalled(standalone);
    if(standalone) return;

    const isIos=/iPad|iPhone|iPod/i.test(navigator.userAgent);
    setIos(isIos);
    const onPrompt=(event:Event)=>{
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled=()=>{
      setInstalled(true);
      setPrompt(null);
      setIos(false);
    };
    window.addEventListener('beforeinstallprompt',onPrompt);
    window.addEventListener('appinstalled',onInstalled);
    return ()=>{
      window.removeEventListener('beforeinstallprompt',onPrompt);
      window.removeEventListener('appinstalled',onInstalled);
    };
  },[]);

  async function install(){
    if(!prompt) return;
    await prompt.prompt();
    const choice=await prompt.userChoice.catch(()=>null);
    if(choice?.outcome==='accepted') setInstalled(true);
    setPrompt(null);
  }

  if(installed||(!prompt&&!ios)) return null;

  return <section className="household-panel pwa-install-card">
    <div>
      <div className="eyebrow">{l('NO SEU CELULAR','ON YOUR DEVICE','EN TU DISPOSITIVO')}</div>
      <h2>{l('Use o NestBalance como um app.','Use NestBalance like an app.','Usa NestBalance como una app.')}</h2>
      <p>{ios
        ? l(
            'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. O app abre em tela cheia e seus dados financeiros continuam vindo do servidor, sem serem salvos no cache offline.',
            'In Safari, tap Share and then “Add to Home Screen”. The app opens full screen and your financial data still comes from the server instead of being stored in the offline cache.',
            'En Safari, toca Compartir y luego “Añadir a pantalla de inicio”. La app se abre a pantalla completa y tus datos financieros siguen viniendo del servidor, sin guardarse en la caché sin conexión.'
          )
        : l(
            'Instale sem loja de aplicativos. O NestBalance abre em uma janela própria e mantém o cache offline limitado à interface pública.',
            'Install without an app store. NestBalance opens in its own window and keeps offline caching limited to the public interface.',
            'Instala sin tienda de aplicaciones. NestBalance se abre en su propia ventana y limita la caché sin conexión a la interfaz pública.'
          )}</p>
    </div>
    {prompt&&<button className="primary-button" onClick={()=>void install()}>
      {l('Instalar NestBalance','Install NestBalance','Instalar NestBalance')}
    </button>}
  </section>;
}
