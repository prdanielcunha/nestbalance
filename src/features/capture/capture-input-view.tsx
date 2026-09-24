'use client';

import { CaptureProgress } from '@/src/features/capture/capture-progress';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import type { UniversalCaptureController } from '@/src/lib/capture/use-universal-capture-controller';

export function CaptureInputView({c}:{c:UniversalCaptureController}){
  const {
    t,l,formatMoney,working,file,scope,setScope,preparedEvidenceId,recording,saving,analyzing,startRecording,stopRecording,
    imageInputRef,fileInputRef,textRef,pasteImageFromClipboard,selectFile,interpret,localOcrText,reprocessLocalAs,text,setText,
    setFile,setPreparedEvidenceId,setAnalysis,setAiAnalysis,setNotice,upload,localOcrPercent,analysis,amountChoices,chooseAmount,
    directionChoice,chooseDirection,geminiUsed,aiAnalysis,geminiStatus,screenSnapshot,geminiWorking,runGeminiFallback,notice,error,reset,
    captureStage,captureStageLabels
  }=c;
  return <>
          <div className="sheet-handle" />
          <div className="eyebrow">{l('Jogue aqui. A gente organiza.','Drop it here. We organize it.','Déjalo aquí. Lo organizamos.')}</div>
          <h2>{l('O que aconteceu?','What happened?','¿Qué pasó?')}</h2>
          <p>{l('Escreva, fale, mande um print ou um arquivo. Você não precisa decidir antes se foi dinheiro que entrou, saiu ou uma conta para pagar.','Write, speak, send a screenshot or a file. You do not need to decide first whether money came in, went out, or is a bill to pay.','Escribe, habla, envía una captura o un archivo. No necesitas decidir antes si entró dinero, salió o es una cuenta por pagar.')}</p>

          {(working||file)&&<CaptureProgress stage={captureStage} labels={captureStageLabels}/>}

          <ScopeChoice value={scope} onChange={setScope} disabled={working||Boolean(preparedEvidenceId)}/>

          <div className="capture-quick-actions" aria-label={l('Como você quer contar','How you want to add it','Cómo quieres contarlo')}>
            <button type="button" disabled={working} onClick={()=>textRef.current?.focus()}>
              <strong>{l('Escrever','Write','Escribir')}</strong><span>{l('Conte do seu jeito','Use your own words','Cuéntalo a tu manera')}</span>
            </button>
            <button type="button" className={recording?'recording':''} disabled={saving||analyzing} onClick={()=>recording?stopRecording():void startRecording()}>
              <strong>{recording?l('Terminar áudio','Finish audio','Terminar audio'):l('Falar','Speak','Hablar')}</strong><span>{recording?l('Estou ouvindo…','Listening…','Escuchando…'):l('Grave na hora','Record now','Graba ahora')}</span>
            </button>
            <button type="button" disabled={working} onClick={()=>imageInputRef.current?.click()}>
              <strong>{l('Print ou foto','Screenshot or photo','Captura o foto')}</strong><span>{l('Galeria ou câmera','Gallery or camera','Galería o cámara')}</span>
            </button>
            <button type="button" disabled={working} onClick={()=>fileInputRef.current?.click()}>
              <strong>{l('Arquivo','File','Archivo')}</strong><span>{l('PDF, CSV ou áudio','PDF, CSV or audio','PDF, CSV o audio')}</span>
            </button>
            <button type="button" disabled={working} onClick={()=>void pasteImageFromClipboard()}>
              <strong>{l('Colar print','Paste screenshot','Pegar captura')}</strong><span>{l('Sem salvar na galeria','No gallery save needed','Sin guardar en galería')}</span>
            </button>
          </div>

          <div className="capture-paste-hint">{l('Você também pode copiar um print e colar direto aqui — no celular ou computador, quando o navegador permitir.','You can also copy a screenshot and paste it directly here — on mobile or desktop when the browser allows it.','También puedes copiar una captura y pegarla aquí — en móvil o computadora cuando el navegador lo permita.')}</div>

          <input
            ref={imageInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={working}
            onChange={e=>{
              const selected=e.target.files?.[0];
              if(!selected) return;
              selectFile(selected,l('Imagem recebida. Já estou organizando.','Image received. I am organizing it now.','Imagen recibida. Ya la estoy organizando.'));
              void interpret(selected);
              e.currentTarget.value='';
            }}
          />
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/*,.pdf,text/plain,text/csv,audio/*"
            disabled={working}
            onChange={e=>{
              const selected=e.target.files?.[0];
              if(!selected) return;
              selectFile(selected,l('Arquivo recebido. Já estou organizando.','File received. I am organizing it now.','Archivo recibido. Ya lo estoy organizando.'));
              void interpret(selected);
              e.currentTarget.value='';
            }}
          />

          {localOcrText&&file?.type.startsWith('image/')&&<div className="capture-reclassify">
            <span>{l('Se eu entendi o tipo errado, me diga o que este print mostra:','If I got the type wrong, tell me what this screenshot shows:','Si entendí mal el tipo, dime qué muestra esta captura:')}</span>
            <div>
              <button type="button" disabled={working} onClick={()=>reprocessLocalAs('recurring')}>{l('Contas recorrentes','Recurring bills','Cuentas recurrentes')}</button>
              <button type="button" disabled={working} onClick={()=>reprocessLocalAs('pots')}>{l('Cofrinhos','Savings pots','Alcancías')}</button>
              <button type="button" disabled={working} onClick={()=>reprocessLocalAs('balance')}>{l('Saldo da conta','Account balance','Saldo de la cuenta')}</button>
            </div>
          </div>}

          <label className="sr-only" htmlFor="universal-capture-text">{l('Conte o que aconteceu','Tell us what happened','Cuéntanos qué pasó')}</label>
          <textarea
            ref={textRef}
            id="universal-capture-text"
            value={text}
            disabled={working}
            onChange={e=>setText(e.target.value)}
            placeholder={l('Ex.: Paguei 119,90 da internet\nRecebi 2.500 do trabalho\nGeladeira em 10x de 189','E.g. Paid 119.90 for internet\nReceived 2,500 from work\nFridge in 10 installments of 189','Ej.: Pagué 119,90 de internet\nRecibí 2.500 del trabajo\nHeladera en 10 cuotas de 189')}
          />

          {file&&<div className="capture-selected-source">
            <span>{l('Recebido','Received','Recibido')}</span>
            <strong>{file.name}</strong>
            {!working&&<button type="button" onClick={()=>{setFile(null);setPreparedEvidenceId(null);setAnalysis(null);setAiAnalysis(null);setNotice('');}}>{l('Trocar','Change','Cambiar')}</button>}
          </div>}

          {upload && <div className="upload-status" role="status" aria-live="polite">
            <div><span>{upload.phase === 'uploading' ? l('Guardando original…','Saving original…','Guardando original…') : l('Conferindo arquivo…','Checking file…','Revisando archivo…')}</span><b>{upload.percent}%</b></div>
            <progress max="100" value={upload.percent}>{upload.percent}%</progress>
          </div>}

          {analyzing && !upload && <p className="confidence-note" role="status">{localOcrPercent>0
            ? l(`Lendo no seu aparelho… ${localOcrPercent}%`,`Reading on your device… ${localOcrPercent}%`,`Leyendo en tu dispositivo… ${localOcrPercent}%`)
            : analysis?.state==='needs_ai'
              ? l('Fazendo a leitura inteligente…','Running intelligent reading…','Realizando lectura inteligente…')
              : l('Entendendo o documento…','Understanding the document…','Entendiendo el documento…')}</p>}

          {amountChoices.length > 0 && <div className="amount-choice-panel">
            <span>{l('Qual valor devo usar?','Which amount should I use?','¿Qué valor debo usar?')}</span>
            <div>{amountChoices.map(value => <button key={value} type="button" onClick={()=>chooseAmount(value)}>{formatMoney(value)}</button>)}</div>
            <small>{l('Nenhum valor é escolhido automaticamente quando o documento é ambíguo.','No amount is selected automatically when the document is ambiguous.','No se elige ningún valor automáticamente cuando el documento es ambiguo.')}</small>
          </div>}

          {directionChoice && <div className="direction-choice-panel">
            <span>{l('O que aconteceu com esse dinheiro?','What happened to this money?','¿Qué pasó con este dinero?')}</span>
            <div>
              <button type="button" onClick={()=>chooseDirection('expense')}>{l('Eu paguei','I paid','Yo pagué')}</button>
              <button type="button" onClick={()=>chooseDirection('income')}>{l('Eu recebi','I received','Yo recibí')}</button>
              <button type="button" onClick={()=>chooseDirection('transfer')}>{l('Só mudou de conta','It only moved accounts','Solo cambió de cuenta')}</button>
            </div>
            <small>{l('Se só passou de uma conta sua para outra, o NestBalance não trata como dinheiro gasto ou recebido.','If it only moved between your own accounts, NestBalance does not count it as spent or received money.','Si solo pasó entre tus propias cuentas, NestBalance no lo cuenta como dinero gastado o recibido.')}</small>
          </div>}

          {analysis?.state === 'extracted' && !aiAnalysis && !geminiUsed && <p className="native-analysis-note">{l('Texto lido localmente · sem enviar a imagem para IA','Text read locally · image not sent to AI','Texto leído localmente · imagen no enviada a IA')}</p>}
          {geminiUsed && <p className="native-analysis-note">{l('Gemini analisou apenas OCR sanitizado · imagem não enviada · confirmação humana antes de guardar','Gemini analyzed only sanitized OCR · image not sent · human confirmation before saving','Gemini analizó solo OCR sanitizado · imagen no enviada · confirmación humana antes de guardar')}</p>}
          {aiAnalysis && <p className="native-analysis-note">{aiAnalysis.kind==='audio'?l('Áudio transcrito com IA','Audio transcribed with AI','Audio transcrito con IA'):l('Imagem lida com IA','Image read with AI','Imagen leída con IA')} · {l('confirmação humana antes de guardar','human confirmation before saving','confirmación humana antes de guardar')}</p>}
          {localOcrText&&geminiStatus?.configured&&!interpretations.length&&!screenSnapshot&&<div className="gemini-fallback-card">
            <div>
              <strong>{l('Quer uma segunda leitura?','Want a second reading?','¿Quieres una segunda lectura?')}</strong>
              <span>{l('Envio somente o texto OCR sanitizado para Gemini 2.5 Flash-Lite. A imagem não sai do seu aparelho neste passo, e números sensíveis são removidos antes da chamada.','Only sanitized OCR text is sent to Gemini 2.5 Flash-Lite. The image does not leave your device in this step, and sensitive numbers are removed before the call.','Solo se envía texto OCR sanitizado a Gemini 2.5 Flash-Lite. La imagen no sale de tu dispositivo en este paso y los números sensibles se eliminan antes de la llamada.')}</span>
            </div>
            <button type="button" disabled={geminiWorking} onClick={()=>void runGeminiFallback()}>
              {geminiWorking?l('Analisando texto protegido…','Analyzing protected text…','Analizando texto protegido…'):l('Tentar leitura protegida com Gemini','Try protected reading with Gemini','Intentar lectura protegida con Gemini')}
            </button>
            <small>O Free Tier do Gemini pode usar o conteúdo enviado para melhorar produtos do Google. Por isso este fallback é opcional e exige este toque.</small>
          </div>}

          {notice && <p className="notice-copy" role="status">{notice}</p>}
          {error && <p className="error-copy" role="alert">{error}</p>}

          <div className="sheet-actions">
            <button className="ghost-button" disabled={working} onClick={reset}>{t.cancel}</button>
            <button className="primary-button" disabled={working || (!text.trim() && !file)} onClick={()=>void interpret()}>
              {analyzing ? l('Organizando…','Organizing…','Organizando…') : l('Organizar','Organize','Organizar')}
            </button>
          </div>
        </>;
}
