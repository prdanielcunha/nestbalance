'use client';
import { useEffect, useRef, useState } from 'react';
import { parseFinancialList } from '@/src/core/text-parser';
import { parseMoneyInputToMinor } from '@/src/core/accounts';
import { buildImportedMovements, resolveImportedMovementDirection } from '@/src/core/movement-import';
import { parseFinancialCsv } from '@/src/core/csv-import';
import type { FinancialInterpretation } from '@/src/core/types';
import { sourceTextForChosenDocumentAmount, suggestCaptureFromDocument } from '@/src/core/document-suggestion';
import { detectDocumentSignals } from '@/src/core/document-signals';
import { parseSavingsPotsFromOcr } from '@/src/core/savings-pot-import';
import { parseRecurringCommitmentsFromOcr } from '@/src/core/recurring-commitment-import';
import { parseAccountBalanceFromOcr } from '@/src/core/account-balance-import';
import {
  aiAmountChoices,
  aiDirectionNeedsConfirmation,
  sourceTextFromAiExtraction,
  type AiFinancialDirection,
  type AiFinancialExtraction,
  type AiFinancialScreenSnapshot
} from '@/src/core/ai-financial';
import { commitInterpretation } from '@/src/lib/repositories/finance';
import { findCommitmentPaymentMatches, payCommitment, type CommitmentPaymentCandidate } from '@/src/lib/repositories/commitment-payments';
import { commitFinancialScreen } from '@/src/lib/repositories/financial-screen';
import {
  analyzeEvidenceAi,
  analyzeEvidenceText,
  ingestEvidence,
  type AiEvidenceAnalysis,
  type EvidenceTextAnalysis,
  type UploadProgress
} from '@/src/lib/repositories/evidence';
import { useI18n } from '@/src/i18n/locale-provider';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import type { FinancialScope } from '@/src/core/privacy';
import { readImageTextLocally } from '@/src/lib/local-image-ocr';
import { analyzeTextWithGeminiFallback, getGeminiFallbackStatus, type GeminiFallbackStatus } from '@/src/lib/repositories/gemini-fallback';

type ConfirmedDirection=Exclude<AiFinancialDirection,'unknown'>;
type PendingAi={extraction:AiFinancialExtraction;amountMinor:number|null};

function markDocumentDerived(items: FinancialInterpretation[]) {
  return items.map(item => ({
    ...item,
    confidence: 'medium' as const,
    needsReview: [...new Set([...item.needsReview, 'document_review'])],
    fieldConfidence: { ...item.fieldConfidence, description: Math.min(item.fieldConfidence.description ?? 0.5, 0.65) }
  }));
}

export function UniversalCapture({ householdId, uid, onCommitted, defaultOpen=false, showTrigger=true, onClose }: { householdId: string; uid: string; onCommitted?: () => void; defaultOpen?: boolean; showTrigger?: boolean; onClose?: () => void }) {
  const {t,locale,intlLocale,formatMoney,formatDate}=useI18n();
  const l=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt;
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preparedEvidenceId, setPreparedEvidenceId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<EvidenceTextAnalysis | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiEvidenceAnalysis | null>(null);
  const [pendingAi, setPendingAi] = useState<PendingAi | null>(null);
  const [amountChoices, setAmountChoices] = useState<number[]>([]);
  const [directionChoice, setDirectionChoice] = useState(false);
  const [interpretations, setInterpretations] = useState<FinancialInterpretation[]>([]);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recording,setRecording]=useState(false);
  const [showAllReview,setShowAllReview]=useState(false);
  const [paymentMatches,setPaymentMatches]=useState<CommitmentPaymentCandidate[]>([]);
  const [matchingPayments,setMatchingPayments]=useState(false);
  const [paymentMatchDismissed,setPaymentMatchDismissed]=useState(false);
  const [payingMatchId,setPayingMatchId]=useState('');
  const [screenSnapshot,setScreenSnapshot]=useState<AiFinancialScreenSnapshot|null>(null);
  const [scope,setScope]=useState<FinancialScope>('household');
  const [localOcrText,setLocalOcrText]=useState('');
  const [localOcrPercent,setLocalOcrPercent]=useState(0);
  const [geminiStatus,setGeminiStatus]=useState<GeminiFallbackStatus|null>(null);
  const [geminiWorking,setGeminiWorking]=useState(false);
  const [geminiUsed,setGeminiUsed]=useState(false);
  const imageInputRef=useRef<HTMLInputElement|null>(null);
  const fileInputRef=useRef<HTMLInputElement|null>(null);
  const textRef=useRef<HTMLTextAreaElement|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const recorderChunksRef=useRef<BlobPart[]>([]);
  const recorderStreamRef=useRef<MediaStream|null>(null);
  const sharedTargetHandledRef=useRef('');

  const working = saving || analyzing || recording || geminiWorking;
  const moneyInputValue=(minor:number)=>(minor/100).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});

  function readEditedMoney(value:string,allowZero=false){
    const parsed=parseMoneyInputToMinor(value,locale);
    if(parsed===null||(allowZero?parsed<0:parsed<=0)){
      setError(l('Confira o valor digitado.','Check the amount you entered.','Revisa el valor ingresado.'));
      return null;
    }
    setError('');
    return parsed;
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !working) setOpen(false); };
    const onPaste=(e:ClipboardEvent)=>{
      const imageItem=Array.from(e.clipboardData?.items||[]).find(item=>item.type.startsWith('image/'));
      if(!imageItem) return;
      const pasted=imageItem.getAsFile();
      if(!pasted) return;
      e.preventDefault();
      const extension=(pasted.type.split('/')[1]||'png').replace('jpeg','jpg');
      const fileFromClipboard=new File([pasted],`print-${Date.now()}.${extension}`,{type:pasted.type||'image/png'});
      selectFile(fileFromClipboard,l('Print colado. Já estou organizando.','Screenshot pasted. I am organizing it now.','Captura pegada. Ya la estoy organizando.'));
      void interpret(fileFromClipboard);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste',onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste',onPaste);
    };
  }, [open, working]);

  useEffect(()=>{
    if(!open||typeof window==='undefined') return;
    const params=new URLSearchParams(window.location.search);
    const shareId=params.get('shareTarget')||'';
    if(!/^[A-Za-z0-9_-]{8,160}$/.test(shareId)||sharedTargetHandledRef.current===shareId) return;
    sharedTargetHandledRef.current=shareId;
    let cancelled=false;

    void (async()=>{
      try{
        const metaResponse=await fetch('/__nestbalance-share/'+encodeURIComponent(shareId)+'/meta',{cache:'no-store'});
        if(!metaResponse.ok) throw new Error('SHARE_NOT_FOUND');
        const meta=await metaResponse.json() as {
          title?:string;
          text?:string;
          url?:string;
          files?:Array<{index:number;name:string;type:string;size:number}>;
        };
        if(cancelled) return;

        const firstFile=Array.isArray(meta.files)?meta.files[0]:null;
        if(firstFile){
          const fileResponse=await fetch('/__nestbalance-share/'+encodeURIComponent(shareId)+'/file-'+firstFile.index,{cache:'no-store'});
          if(!fileResponse.ok) throw new Error('SHARED_FILE_NOT_FOUND');
          const blob=await fileResponse.blob();
          if(cancelled) return;
          const sharedFile=new File([blob],firstFile.name||'compartilhado',{type:firstFile.type||blob.type||'application/octet-stream'});
          selectFile(sharedFile,l('Recebido pelo Compartilhar. Já estou organizando.','Received from Share. I am organizing it now.','Recibido desde Compartir. Ya lo estoy organizando.'));
          await interpret(sharedFile);
        }else{
          const sharedText=[meta.text,meta.url,meta.title].map(value=>String(value||'').trim()).filter(Boolean).join('\n');
          if(!sharedText) throw new Error('EMPTY_SHARE');
          setText(sharedText);
          try{applySourceText(sharedText);}catch{}
          setNotice(l('Recebido pelo Compartilhar. Confira antes de guardar.','Received from Share. Review before saving.','Recibido desde Compartir. Revisa antes de guardar.'));
          queueMicrotask(()=>textRef.current?.focus());
        }
      }catch{
        if(!cancelled) setError(l(
          'Não consegui abrir o conteúdo compartilhado. Você ainda pode colar, fotografar ou escolher o arquivo aqui.',
          'I could not open the shared content. You can still paste, photograph, or choose the file here.',
          'No pude abrir el contenido compartido. Aún puedes pegar, fotografiar o elegir el archivo aquí.'
        ));
      }finally{
        void fetch('/__nestbalance-share/'+encodeURIComponent(shareId),{method:'DELETE'}).catch(()=>undefined);
        if(!cancelled){
          const clean=new URL(window.location.href);
          clean.searchParams.delete('shareTarget');
          clean.searchParams.delete('shareError');
          window.history.replaceState({},'',clean.pathname+(clean.search||''));
        }
      }
    })();

    return ()=>{cancelled=true;};
  },[open]);

  function stopRecorderTracks(){
    recorderStreamRef.current?.getTracks().forEach(track=>track.stop());
    recorderStreamRef.current=null;
    recorderRef.current=null;
    recorderChunksRef.current=[];
  }

  function clearAll() {
    stopRecorderTracks();
    setRecording(false);
    setShowAllReview(false);
    setPaymentMatches([]);
    setMatchingPayments(false);
    setPaymentMatchDismissed(false);
    setPayingMatchId('');
    setScreenSnapshot(null);
    setScope('household');
    setLocalOcrText('');
    setLocalOcrPercent(0);
    setGeminiStatus(null);
    setGeminiWorking(false);
    setGeminiUsed(false);
    setOpen(false);
    onClose?.();
    setText('');
    setFile(null);
    setPreparedEvidenceId(null);
    setAnalysis(null);
    setAiAnalysis(null);
    setPendingAi(null);
    setAmountChoices([]);
    setDirectionChoice(false);
    setInterpretations([]);
    setUpload(null);
    setError('');
    setNotice('');
  }

  function reset() {
    if (working) return;
    clearAll();
  }

  function selectFile(nextFile:File,noticeText=''){
    setFile(nextFile);
    setText('');
    setPreparedEvidenceId(null);
    setAnalysis(null);
    setAiAnalysis(null);
    setPendingAi(null);
    setAmountChoices([]);
    setDirectionChoice(false);
    setInterpretations([]);
    setPaymentMatches([]);
    setMatchingPayments(false);
    setPaymentMatchDismissed(false);
    setPayingMatchId('');
    setScreenSnapshot(null);
    setLocalOcrText('');
    setLocalOcrPercent(0);
    setGeminiStatus(null);
    setGeminiWorking(false);
    setGeminiUsed(false);
    setError('');
    setNotice(noticeText);
  }

  async function pasteImageFromClipboard(){
    if(working) return;
    setError('');
    const clipboard=(navigator as any)?.clipboard;
    if(!clipboard?.read){
      setError(l('Este navegador não liberou colar imagens por botão. Você ainda pode copiar o print e usar Colar no navegador, ou escolher a imagem sem precisar manter uma cópia depois.','This browser does not expose image paste through a button. You can still use the browser Paste action or choose the image.','Este navegador no permite pegar imágenes con un botón. Aún puedes usar Pegar del navegador o elegir la imagen.'));
      return;
    }
    try{
      const items=await clipboard.read();
      for(const item of items){
        const imageType=(item.types||[]).find((type:string)=>type.startsWith('image/'));
        if(!imageType) continue;
        const blob=await item.getType(imageType);
        const extension=(imageType.split('/')[1]||'png').replace('jpeg','jpg');
        const pasted=new File([blob],`print-colado-${Date.now()}.${extension}`,{type:imageType});
        selectFile(pasted,l('Print colado. Já estou organizando.','Screenshot pasted. I am organizing it now.','Captura pegada. Ya la estoy organizando.'));
        void interpret(pasted);
        return;
      }
      setError(l('Não encontrei uma imagem copiada agora. Copie o print e tente novamente.','I could not find a copied image. Copy the screenshot and try again.','No encontré una imagen copiada. Copia la captura e inténtalo de nuevo.'));
    }catch{
      setError(l('O navegador não liberou a área de transferência. Tente novamente após copiar o print ou use “Print ou foto”.','The browser did not grant clipboard access. Copy the screenshot again or use “Screenshot or photo”.','El navegador no dio acceso al portapapeles. Copia la captura otra vez o usa “Captura o foto”.'));
    }
  }

  function reprocessLocalAs(kind:'recurring'|'pots'|'balance'){
    if(!localOcrText.trim()) return;
    const next=kind==='recurring'
      ? parseRecurringCommitmentsFromOcr(localOcrText)
      : kind==='pots'
        ? parseSavingsPotsFromOcr(localOcrText)
        : parseAccountBalanceFromOcr(localOcrText);
    if(!next){
      setError(kind==='recurring'
        ? l('Não encontrei linhas suficientes de contas recorrentes nesse print. Você pode corrigir pelo texto ou tentar uma imagem mais nítida.','I could not find enough recurring-bill rows in this screenshot. You can correct it with text or try a clearer image.','No encontré suficientes filas de cuentas recurrentes en esta captura. Puedes corregir por texto o probar una imagen más nítida.')
        : kind==='pots'
          ? l('Não encontrei uma lista de cofrinhos confiável nesse print.','I could not find a reliable savings-pot list in this screenshot.','No encontré una lista confiable de alcancías en esta captura.')
          : l('Não encontrei um saldo principal confiável nesse print.','I could not find a reliable primary balance in this screenshot.','No encontré un saldo principal confiable en esta captura.'));
      return;
    }
    setScreenSnapshot(next);
    setInterpretations([]);
    setAmountChoices([]);
    setDirectionChoice(false);
    setPendingAi(null);
    setError('');
    setNotice(kind==='recurring'
      ? l(`Reanalisei como contas recorrentes e encontrei ${next.commitments.length}. Confira antes de guardar.`,`I re-read it as recurring bills and found ${next.commitments.length}. Review before saving.`,`La releí como cuentas recurrentes y encontré ${next.commitments.length}. Revisa antes de guardar.`)
      : kind==='pots'
        ? l(`Reanalisei como cofrinhos e encontrei ${next.pots.length}.`,`I re-read it as savings pots and found ${next.pots.length}.`,`La releí como alcancías y encontré ${next.pots.length}.`)
        : l('Reanalisei como tela de saldo e usei o valor ligado ao saldo principal, não limites, fatura ou empréstimos.','I re-read it as a balance screen and used the amount tied to the primary balance, not limits, statements, or loans.','La releí como pantalla de saldo y usé el valor ligado al saldo principal, no límites, facturas ni préstamos.'));
  }

  async function startRecording(){
    if(recording||working) return;
    setError('');
    setNotice('');
    if(typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
      setError(l('Este aparelho não liberou gravação direta. Você ainda pode enviar um áudio já gravado.','This device did not allow direct recording. You can still upload an audio file.','Este dispositivo no permitió grabar directamente. Aún puedes subir un archivo de audio.'));
      fileInputRef.current?.click();
      return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const recorder=new MediaRecorder(stream);
      recorderStreamRef.current=stream;
      recorderRef.current=recorder;
      recorderChunksRef.current=[];
      recorder.ondataavailable=event=>{ if(event.data.size) recorderChunksRef.current.push(event.data); };
      recorder.onstop=()=>{
        const mimeType=recorder.mimeType||'audio/webm';
        const blob=new Blob(recorderChunksRef.current,{type:mimeType});
        const extension=mimeType.includes('mp4')?'m4a':mimeType.includes('ogg')?'ogg':'webm';
        const recorded=new File([blob],`audio-${Date.now()}.${extension}`,{type:mimeType});
        stopRecorderTracks();
        setRecording(false);
        selectFile(recorded,l('Áudio recebido. Já estou organizando.','Audio received. I am organizing it now.','Audio recibido. Ya lo estoy organizando.'));
        void interpret(recorded);
      };
      recorder.start();
      setRecording(true);
      setNotice(l('Pode falar do seu jeito. Quando terminar, toque em “Terminar áudio”.','Speak naturally. When you finish, tap “Finish audio”.','Habla con naturalidad. Cuando termines, toca “Terminar audio”.'));
    }catch{
      stopRecorderTracks();
      setRecording(false);
      setError(l('Não consegui acessar o microfone. Você pode enviar um áudio já gravado.','I could not access the microphone. You can upload an audio file instead.','No pude acceder al micrófono. Puedes subir un archivo de audio.'));
    }
  }

  function stopRecording(){
    if(!recording) return;
    const recorder=recorderRef.current;
    if(recorder&&recorder.state!=='inactive') recorder.stop();
    else{
      stopRecorderTracks();
      setRecording(false);
    }
  }

  async function loadPaymentMatches(item:FinancialInterpretation){
    if(item.kind!=='transaction'||item.direction!=='expense'||item.money.amountMinor<=0) {
      setPaymentMatches([]);
      return;
    }
    setMatchingPayments(true);
    setPaymentMatches([]);
    setPaymentMatchDismissed(false);
    try{
      const result=await findCommitmentPaymentMatches({
        householdId,
        amountMinor:item.money.amountMinor,
        description:item.description,
        observedOn:item.occurredOn||null
      });
      setPaymentMatches(result.matches);
    }catch{
      setPaymentMatches([]);
    }finally{
      setMatchingPayments(false);
    }
  }

  function applySourceText(sourceText: string, documentDerived = false) {
    const parsed = parseFinancialList(sourceText);
    const prepared=documentDerived ? markDocumentDerived(parsed) : parsed;
    setText(sourceText);
    setInterpretations(prepared);
    setAmountChoices([]);
    setDirectionChoice(false);
    setPendingAi(null);
    setPaymentMatches([]);
    setPaymentMatchDismissed(false);
    if(prepared.length===1) void loadPaymentMatches(prepared[0]);
  }

  function prepareAiReview(extraction:AiFinancialExtraction,amountOverride?:number,directionOverride?:ConfirmedDirection){
    const candidates=aiAmountChoices(extraction);
    const trustedPrimary=extraction.amountMinor && extraction.amountConfidence>=0.82 ? extraction.amountMinor : null;
    const amountMinor=amountOverride ?? trustedPrimary ?? (candidates.length===1?candidates[0]:null);

    if(!amountMinor){
      setPendingAi({extraction,amountMinor:null});
      setAmountChoices(candidates);
      setDirectionChoice(false);
      setNotice(candidates.length
        ? l('Encontrei mais de um valor possível. Qual representa esta movimentação?','I found more than one possible amount. Which one represents this activity?','Encontré más de un valor posible. ¿Cuál representa este movimiento?')
        : l('Li a imagem, mas não encontrei um valor confiável. Você pode escrever o que aconteceu acima.','I read the image but could not find a reliable amount. You can describe what happened above.','Leí la imagen, pero no encontré un valor confiable. Puedes describir arriba lo que pasó.'));
      return;
    }

    const modelDirection=!aiDirectionNeedsConfirmation(extraction)&&extraction.direction!=='unknown'
      ? extraction.direction
      : null;
    const direction=directionOverride ?? modelDirection;
    if(!direction){
      setPendingAi({extraction,amountMinor});
      setAmountChoices([]);
      setDirectionChoice(true);
      setNotice(l('Encontrei o valor. Só preciso saber como esse dinheiro se moveu.','I found the amount. I just need to know how this money moved.','Encontré el valor. Solo necesito saber cómo se movió este dinero.'));
      return;
    }

    const sourceText=sourceTextFromAiExtraction(extraction,{amountMinor,direction});
    if(!sourceText){
      setError(l('Consegui ler a imagem, mas ainda preciso que você descreva esse movimento.','I could read the image, but I still need you to describe this activity.','Pude leer la imagen, pero todavía necesito que describas este movimiento.'));
      return;
    }
    applySourceText(sourceText,true);
    setNotice(l('Li a imagem com inteligência visual. Confira antes de guardar.','I read the image with visual intelligence. Review it before saving.','Leí la imagen con inteligencia visual. Revísala antes de guardar.'));
  }

  async function tryLocalImage(activeFile:File){
    setLocalOcrPercent(1);
    try{
      const ocr=await readImageTextLocally(activeFile,progress=>setLocalOcrPercent(progress.percent),locale);
      setLocalOcrText(ocr);
      if(!ocr.trim()){
        setNotice(l('Não consegui encontrar texto legível nessa imagem. Você pode tentar outro print ou contar o que aconteceu por texto.','I could not find readable text in this image. Try another screenshot or describe what happened in text.','No encontré texto legible en esta imagen. Prueba otra captura o describe por texto lo que pasó.'));
        return true;
      }

      const signals=detectDocumentSignals(ocr);
      setAnalysis({
        state:'extracted',
        parser:'local-ocr-v1',
        reason:null,
        text:ocr,
        characters:ocr.length,
        truncated:false,
        totalPages:null,
        extractedPages:null,
        signals
      });

      const recurringScreen=parseRecurringCommitmentsFromOcr(ocr);
      if(recurringScreen?.commitments.length){
        setScreenSnapshot(recurringScreen);
        setInterpretations([]);
        setAmountChoices([]);
        setDirectionChoice(false);
        setPendingAi(null);
        setNotice(l(
          `Encontrei ${recurringScreen.commitments.length} conta${recurringScreen.commitments.length===1?'':'s'} recorrente${recurringScreen.commitments.length===1?'':'s'}. Vou guardar como compromissos mensais, não como movimentos soltos.`,
          `I found ${recurringScreen.commitments.length} recurring bill${recurringScreen.commitments.length===1?'':'s'}. I will save them as monthly commitments, not isolated movements.`,
          `Encontré ${recurringScreen.commitments.length} cuenta${recurringScreen.commitments.length===1?'':'s'} recurrente${recurringScreen.commitments.length===1?'':'s'}. Las guardaré como compromisos mensuales, no como movimientos aislados.`
        ));
        return true;
      }

      const savingsPotsScreen=parseSavingsPotsFromOcr(ocr);
      if(savingsPotsScreen?.pots.length){
        setScreenSnapshot(savingsPotsScreen);
        setInterpretations([]);
        setAmountChoices([]);
        setDirectionChoice(false);
        setPendingAi(null);
        setNotice(l(
          `Encontrei ${savingsPotsScreen.pots.length} cofrinho${savingsPotsScreen.pots.length===1?'':'s'}${savingsPotsScreen.institution?' em '+savingsPotsScreen.institution:''}. Confira nomes, saldos e metas antes de guardar.`,
          `I found ${savingsPotsScreen.pots.length} savings pot${savingsPotsScreen.pots.length===1?'':'s'}${savingsPotsScreen.institution?' at '+savingsPotsScreen.institution:''}. Review names, balances, and goals before saving.`,
          `Encontré ${savingsPotsScreen.pots.length} alcancía${savingsPotsScreen.pots.length===1?'':'s'}${savingsPotsScreen.institution?' en '+savingsPotsScreen.institution:''}. Revisa nombres, saldos y metas antes de guardar.`
        ));
        return true;
      }

      const balanceScreen=parseAccountBalanceFromOcr(ocr);
      if(balanceScreen?.accounts.length){
        setScreenSnapshot(balanceScreen);
        setInterpretations([]);
        setAmountChoices([]);
        setDirectionChoice(false);
        setPendingAi(null);
        setNotice(l(
          'Identifiquei o saldo principal pela posição e pelo rótulo “Saldo”. Valores de cartão, limite e empréstimo ficaram de fora.',
          'I identified the primary balance by its position and Balance label. Card, limit, and loan amounts were left out.',
          'Identifiqué el saldo principal por su posición y la etiqueta “Saldo”. Excluí valores de tarjeta, límite y préstamo.'
        ));
        return true;
      }

      const suggestion=suggestCaptureFromDocument(activeFile.name,signals);
      if(suggestion.state==='suggested'){
        applySourceText(suggestion.sourceText,true);
        setNotice(l('Li este print no seu aparelho, sem enviar a imagem para uma IA. Confira antes de guardar.','I read this screenshot on your device without sending the image to AI. Review it before saving.','Leí esta captura en tu dispositivo sin enviar la imagen a una IA. Revísala antes de guardar.'));
        return true;
      }
      if(suggestion.state==='choose_amount'){
        setAmountChoices(suggestion.amountsMinor);
        setNotice(l('Li o print no seu aparelho e encontrei mais de um valor. Qual deles representa este movimento?','I read the screenshot on your device and found more than one amount. Which one represents this activity?','Leí la captura en tu dispositivo y encontré más de un valor. ¿Cuál representa este movimiento?'));
        return true;
      }

      try{
        const status=await getGeminiFallbackStatus(householdId);
        setGeminiStatus(status);
        setNotice(status.configured
          ? l('A leitura local terminou, mas ainda há contexto ambíguo. Se quiser, posso tentar o fallback Gemini usando somente texto sanitizado — a imagem não será enviada.','Local reading finished, but some context is still ambiguous. If you want, I can try the Gemini fallback using only sanitized text — the image will not be sent.','La lectura local terminó, pero todavía hay contexto ambiguo. Si quieres, puedo intentar el fallback de Gemini usando solo texto sanitizado — la imagen no se enviará.')
          : l('A leitura local terminou, mas não fechou a interpretação. O fallback online gratuito não está ativado neste ambiente; você pode preencher manualmente sem perder o print.','Local reading finished but could not complete the interpretation. The free online fallback is not enabled in this environment; you can fill it in manually without losing the screenshot.','La lectura local terminó pero no completó la interpretación. El fallback online gratuito no está habilitado en este entorno; puedes completarlo manualmente sin perder la captura.'));
      }catch{
        setGeminiStatus(null);
        setNotice(l('A leitura local terminou, mas não fechou a interpretação. Você pode preencher manualmente; a imagem continua apenas no seu aparelho até você guardar.','Local reading finished but could not complete the interpretation. You can fill it in manually; the image stays only on your device until you save.','La lectura local terminó pero no completó la interpretación. Puedes completarla manualmente; la imagen permanece solo en tu dispositivo hasta que guardes.'));
      }
      return true;
    }catch{
      setLocalOcrText('');
      setNotice(l('Não consegui ler esse print localmente. Tente outra imagem ou conte o que aconteceu por texto.','I could not read this screenshot locally. Try another image or describe what happened in text.','No pude leer esta captura localmente. Prueba otra imagen o describe por texto lo que pasó.'));
      return true;
    }finally{
      setLocalOcrPercent(0);
    }
  }

  async function runGeminiFallback(){
    if(!localOcrText||!geminiStatus?.configured||geminiWorking) return;
    setGeminiWorking(true);
    setError('');
    try{
      const result=await analyzeTextWithGeminiFallback({
        householdId,
        text:localOcrText,
        consentVersion:geminiStatus.consentVersion
      });
      const extraction=result.extraction;
      setAiAnalysis(null);
      setGeminiUsed(true);

      if(extraction.screen){
        const screen=extraction.screen;
        const resourceCount=screen.accounts.length+screen.pots.length+screen.cards.length+screen.commitments.length;
        if(resourceCount>0) setScreenSnapshot(screen);
        const imported=buildImportedMovements({
          documentType:screen.screenType==='transaction_list'?'transaction_list':'bank_screenshot',
          institution:screen.institution,
          overallConfidence:extraction.overallConfidence,
          ambiguities:extraction.ambiguities,
          items:screen.movements
        });
        if(imported.length) setInterpretations(imported);
        if(resourceCount||imported.length){
          const reviewCount=imported.filter(item=>item.needsReview.length>0).length;
          setNotice(reviewCount
            ? l(`O Gemini ajudou a separar a tela usando apenas OCR sanitizado. ${reviewCount} movimento${reviewCount===1?' precisa':'s precisam'} de conferência.`,`Gemini helped separate the screen using only sanitized OCR. ${reviewCount} movement${reviewCount===1?' needs':'s need'} review.`,`Gemini ayudó a separar la pantalla usando solo OCR sanitizado. ${reviewCount} movimiento${reviewCount===1?' necesita':'s necesitan'} revisión.`)
            : l('O Gemini ajudou a separar a tela usando apenas OCR sanitizado. A imagem não foi enviada; confira antes de guardar.','Gemini helped separate the screen using only sanitized OCR. The image was not sent; review before saving.','Gemini ayudó a separar la pantalla usando solo OCR sanitizado. La imagen no se envió; revisa antes de guardar.'));
          return;
        }
      }

      prepareAiReview(extraction);
      setNotice(l('O Gemini analisou somente o texto OCR sanitizado. A imagem não foi enviada. Confira antes de guardar.','Gemini analyzed only sanitized OCR text. The image was not sent. Review before saving.','Gemini analizó solo el texto OCR sanitizado. La imagen no se envió. Revisa antes de guardar.'));
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='GEMINI_FREE_QUOTA_EXHAUSTED'||code==='GEMINI_FREE_DAILY_CAP_REACHED'){
        setNotice(l('A cota gratuita de leitura inteligente acabou por agora. O app continua funcionando com leitura local e preenchimento manual, sem gerar cobrança.','The free intelligent-reading quota is used up for now. The app keeps working with local reading and manual entry, with no charge.','La cuota gratuita de lectura inteligente se agotó por ahora. La app sigue funcionando con lectura local y carga manual, sin generar cobros.'));
      }else if(code==='GEMINI_FREE_NOT_CONFIGURED'){
        setGeminiStatus(current=>current?{...current,configured:false}:current);
        setNotice(l('O fallback Gemini gratuito não está ativado neste ambiente. Nenhuma cobrança foi gerada.','The free Gemini fallback is not enabled in this environment. No charge was generated.','El fallback gratuito de Gemini no está habilitado en este entorno. No se generó ningún cobro.'));
      }else{
        setError(l('A leitura protegida não conseguiu concluir agora. Você pode continuar manualmente sem perder o original.','Protected reading could not finish right now. You can continue manually without losing the original.','La lectura protegida no pudo finalizar ahora. Puedes continuar manualmente sin perder el original.'));
      }
    }finally{
      setGeminiWorking(false);
    }
  }

  async function interpret(overrideFile?:File) {
    setError('');
    setNotice('');
    setAmountChoices([]);
    setDirectionChoice(false);

    const activeFile=overrideFile??file;

    if (!overrideFile&&text.trim()) {
      try { applySourceText(text); }
      catch { setError(l('Conte o que aconteceu e, se souber, o valor.','Tell me what happened and, if you know it, the amount.','Cuéntame qué pasó y, si sabes, el valor.')); }
      return;
    }

    if (!activeFile) {
      setError(l('Escreva, fale, cole um print ou escolha um arquivo.','Write, speak, paste a screenshot, or choose a file.','Escribe, habla, pega una captura o elige un archivo.'));
      return;
    }

    if(activeFile.type.startsWith('image/')){
      setAnalyzing(true);
      setUpload(null);
      try{
        if(!localOcrText) await tryLocalImage(activeFile);
        else setNotice(geminiStatus?.configured
          ? l('A leitura local já terminou. Use o fallback protegido abaixo se quiser uma segunda interpretação.','Local reading is complete. Use the protected fallback below if you want a second interpretation.','La lectura local ya terminó. Usa el fallback protegido de abajo si quieres una segunda interpretación.')
          : l('A leitura local já terminou. Você pode ajustar manualmente sem enviar a imagem para uma IA.','Local reading is complete. You can adjust it manually without sending the image to AI.','La lectura local ya terminó. Puedes ajustarla manualmente sin enviar la imagen a una IA.'));
      }finally{
        setAnalyzing(false);
      }
      return;
    }

    setAnalyzing(true);
    setUpload(null);
    try {
      let evidenceId = preparedEvidenceId;
      if (!evidenceId) {
        const evidence = await ingestEvidence(householdId, activeFile, progress => setUpload(progress), scope);
        evidenceId = evidence.canonicalEvidenceId;
        setPreparedEvidenceId(evidenceId);
      }

      const result = await analyzeEvidenceText(householdId, evidenceId);
      setAnalysis(result);
      setUpload(null);

      if (result.state === 'needs_ai') {
        try{
          const ai=await analyzeEvidenceAi(householdId,evidenceId);
          setAiAnalysis(ai);
          if(ai.kind==='image'&&ai.extraction?.screen){
            const screen=ai.extraction.screen;
            const resourceCount=screen.accounts.length+screen.pots.length+screen.cards.length+screen.commitments.length;
            if(resourceCount>0) setScreenSnapshot(screen);
            if(ai.parsedInterpretations?.length) setInterpretations(ai.parsedInterpretations);
            const movementCount=ai.parsedInterpretations?.length||0;
            const unresolved=ai.parsedInterpretations?.filter(item=>item.needsReview.includes('direction')).length||0;
            if(resourceCount||movementCount){
              setNotice(unresolved
                ? l(`Entendi esta tela e organizei o que estava claro. Só ${unresolved} movimentação${unresolved===1?' precisa':' precisam'} de uma resposta rápida.`,`I understood this screen and organized what was clear. Only ${unresolved} movement${unresolved===1?' needs':'s need'} a quick answer.`,`Entendí esta pantalla y organicé lo que estaba claro. Solo ${unresolved} movimiento${unresolved===1?' necesita':'s necesitan'} una respuesta rápida.`)
                : l('Entendi a tela financeira. Saldo, dinheiro guardado, contas, cartão e movimentos ficam separados corretamente.','I understood the financial screen. Balance, saved money, bills, card and movements stay correctly separated.','Entendí la pantalla financiera. Saldo, dinero guardado, cuentas, tarjeta y movimientos quedan correctamente separados.'));
              return;
            }
          }
          if(ai.kind==='audio'){
            const transcript=ai.transcript?.trim()||'';
            if(!transcript||!ai.parsedInterpretations?.length){
              setNotice(l('Áudio transcrito, mas não encontrei uma movimentação clara. Você pode ajustar o texto acima.','Audio transcribed, but I did not find a clear financial movement. You can adjust the text above.','Audio transcrito, pero no encontré un movimiento financiero claro. Puedes ajustar el texto de arriba.'));
              if(transcript) setText(transcript);
              return;
            }
            const audioItems=markDocumentDerived(ai.parsedInterpretations);
            setText(transcript);
            setInterpretations(audioItems);
            if(audioItems.length===1) void loadPaymentMatches(audioItems[0]);
            setNotice(ai.transcriptTruncated
          ? l('Transcrevi o áudio parcialmente. Confira antes de guardar.','I transcribed the audio partially. Review it before saving.','Transcribí el audio parcialmente. Revísalo antes de guardar.')
          : l('Transcrevi o áudio. Confira antes de guardar.','I transcribed the audio. Review it before saving.','Transcribí el audio. Revísalo antes de guardar.'));
            return;
          }
          if(ai.extraction){
            prepareAiReview(ai.extraction);
            return;
          }
          setNotice(l('O original está guardado, mas não consegui extrair dados financeiros suficientes.','The original is saved, but I could not extract enough financial data.','El original está guardado, pero no pude extraer suficientes datos financieros.'));
          return;
        }catch(err:any){
          if(err?.message==='AI_NOT_CONFIGURED'){
            setNotice(result.reason==='audio_input'
              ? l('Áudio guardado. A transcrição inteligente ainda não está conectada neste ambiente.','Audio saved. Intelligent transcription is not connected in this environment yet.','Audio guardado. La transcripción inteligente aún no está conectada en este entorno.')
              : l('Imagem guardada. A leitura inteligente ainda não está conectada neste ambiente.','Image saved. Intelligent reading is not connected in this environment yet.','Imagen guardada. La lectura inteligente aún no está conectada en este entorno.'));
            return;
          }
          if(err?.message==='AI_ANALYSIS_IN_PROGRESS'){
            setNotice(l('Este arquivo já está sendo analisado. Toque em Entender novamente para buscar o resultado.','This file is already being analyzed. Tap Understand again to fetch the result.','Este archivo ya está siendo analizado. Toca Entender de nuevo para buscar el resultado.'));
            return;
          }
          throw err;
        }
      }

      if (result.state !== 'extracted') {
        setError(l('Guardei o original, mas não encontrei texto confiável para organizar automaticamente.','I saved the original, but could not find reliable text to organize automatically.','Guardé el original, pero no encontré texto confiable para organizar automáticamente.'));
        return;
      }

      if(/\.csv$/i.test(activeFile.name)&&result.text){
        const csv=parseFinancialCsv(result.text);
        if(csv.state==='parsed'){
          setInterpretations(csv.items);
          const attention=csv.items.filter(item=>item.needsReview.length>0).length;
          setNotice(attention
            ? l(`Importei ${csv.items.length} movimentações do arquivo. Só ${attention} precisa${attention===1?'':'m'} de uma conferência rápida.`,`I imported ${csv.items.length} movements from the file. Only ${attention} need${attention===1?'s':''} a quick review.`,`Importé ${csv.items.length} movimientos del archivo. Solo ${attention} necesita${attention===1?'':'n'} una revisión rápida.`)
            : l(`Importei ${csv.items.length} movimentações do arquivo. Tudo pronto para guardar.`,`I imported ${csv.items.length} movements from the file. Everything is ready to save.`,`Importé ${csv.items.length} movimientos del archivo. Todo está listo para guardar.`));
          return;
        }
      }

      const suggestion = suggestCaptureFromDocument(activeFile.name, result.signals);
      if (suggestion.state === 'suggested') {
        applySourceText(suggestion.sourceText, true);
        setNotice(l('Li o texto do documento sem IA. Confira antes de guardar.','I read the document text without AI. Review it before saving.','Leí el texto del documento sin IA. Revísalo antes de guardar.'));
        return;
      }

      if (suggestion.state === 'choose_amount') {
        setAmountChoices(suggestion.amountsMinor);
        setNotice(l('Encontrei mais de um valor. Qual deles representa este pagamento?','I found more than one amount. Which one represents this payment?','Encontré más de un valor. ¿Cuál representa este pago?'));
        return;
      }

      setNotice(l('Consegui ler o documento, mas não encontrei um valor claro. Diga acima o que aconteceu; o original já está guardado.','I could read the document but did not find a clear amount. Describe what happened above; the original is already saved.','Pude leer el documento, pero no encontré un valor claro. Describe arriba lo que pasó; el original ya está guardado.'));
    } catch {
      setError(l('Não consegui analisar esse arquivo agora. O que foi concluído com segurança não será duplicado.','I could not analyze this file right now. Anything completed safely will not be duplicated.','No pude analizar este archivo ahora. Lo que se completó de forma segura no se duplicará.'));
    } finally {
      setAnalyzing(false);
    }
  }

  function chooseAmount(amountMinor: number) {
    if(pendingAi){
      prepareAiReview(pendingAi.extraction,amountMinor);
      return;
    }
    if (!file || !analysis || analysis.state !== 'extracted') return;
    try {
      applySourceText(sourceTextForChosenDocumentAmount(file.name, amountMinor, analysis.signals), true);
      setNotice(l('Usei o valor que você escolheu. Confira o restante antes de guardar.','I used the amount you chose. Review the rest before saving.','Usé el valor que elegiste. Revisa el resto antes de guardar.'));
    } catch {
      setError(l('Não consegui preparar essa revisão.','I could not prepare this review.','No pude preparar esta revisión.'));
    }
  }

  function chooseDirection(direction:ConfirmedDirection){
    if(!pendingAi?.amountMinor) return;
    prepareAiReview(pendingAi.extraction,pendingAi.amountMinor,direction);
  }

  function chooseImportedDirection(index:number,direction:ConfirmedDirection){
    setInterpretations(items=>items.map((item,itemIndex)=>
      itemIndex===index?resolveImportedMovementDirection(item,direction):item
    ));
  }

  async function confirmMatchedPayment(candidate:CommitmentPaymentCandidate){
    if(payingMatchId||saving) return;
    setPayingMatchId(candidate.commitment.id);
    setError('');
    try{
      await payCommitment({
        householdId,
        commitmentId:candidate.commitment.id,
        paidOn:interpretations[0]?.occurredOn,
        evidenceId:preparedEvidenceId
      });
      clearAll();
      onCommitted?.();
    }catch{
      setError(l('Não conseguimos ligar esse pagamento à conta agora. Você pode escolher “Nenhuma dessas” e guardar normalmente.','We could not link this payment to the bill right now. You can choose “None of these” and save normally.','No pudimos vincular este pago con la cuenta ahora. Puedes elegir “Ninguna de estas” y guardar normalmente.'));
    }finally{
      setPayingMatchId('');
    }
  }

  async function confirm() {
    if (!interpretations.length&&!screenSnapshot) return;
    if(paymentMatches.length&&!paymentMatchDismissed){
      setError(l('Escolha a conta que este pagamento quitou ou toque em “Nenhuma dessas”.','Choose the bill this payment settled or tap “None of these”.','Elige la cuenta que este pago liquidó o toca “Ninguna de estas”.'));
      return;
    }
    const unresolved=interpretations.filter(item=>item.needsReview.includes('direction')).length;
    if(unresolved){
      setError(l(`Só falta dizer o que aconteceu em ${unresolved} item${unresolved===1?'':'s'}.`,`You only need to say what happened in ${unresolved} item${unresolved===1?'':'s'}.`,`Solo falta decir qué pasó en ${unresolved} elemento${unresolved===1?'':'s'}.`));
      return;
    }
    setSaving(true);
    setUpload(null);
    setError('');
    setNotice('');
    try {
      let finalEvidenceId=preparedEvidenceId;
      if(screenSnapshot&&!finalEvidenceId&&file){
        const evidence=await ingestEvidence(householdId,file,progress=>setUpload(progress),scope);
        finalEvidenceId=evidence.canonicalEvidenceId;
        setPreparedEvidenceId(finalEvidenceId);
      }

      let created = 0;
      if(screenSnapshot&&finalEvidenceId){
        await commitFinancialScreen({
          householdId,
          evidenceId:finalEvidenceId,
          scope,
          screenSnapshot,
          analysisSource:geminiUsed?'gemini_text':aiAnalysis?'server_vision':'local_ocr'
        });
        created++;
      }
      let duplicates = 0;
      for (let i = 0; i < interpretations.length; i++) {
        const result = await commitInterpretation({
          householdId,
          uid,
          interpretation: interpretations[i],
          evidenceId: i === 0 ? finalEvidenceId : null,
          file: i === 0 && !finalEvidenceId ? file : null,
          onUploadProgress: progress => setUpload(progress),
          scope
        });
        if (result.status === 'duplicate') duplicates++;
        else created++;
      }
      if (duplicates && !created) {
        setNotice(l('Isso já parece estar registrado. Não criamos uma cópia.','This already appears to be recorded. We did not create a copy.','Esto ya parece estar registrado. No creamos una copia.'));
        setSaving(false);
        setUpload(null);
        return;
      }
      clearAll();
      onCommitted?.();
    } catch {
      setError(l('Não conseguimos salvar isso agora. Nada foi marcado como concluído.','We could not save this right now. Nothing was marked as completed.','No pudimos guardar esto ahora. Nada se marcó como completado.'));
    } finally {
      setSaving(false);
    }
  }

  const indexedInterpretations=interpretations.map((item,index)=>({item,index}));
  const attentionInterpretations=indexedInterpretations.filter(({item})=>item.confidence!=='high'||item.needsReview.includes('direction'));
  const readyInterpretations=indexedInterpretations.filter(({item})=>item.confidence==='high'&&!item.needsReview.includes('direction'));
  const reviewCount = attentionInterpretations.length;
  const unresolvedDirectionCount=interpretations.filter(x=>x.needsReview.includes('direction')).length;
  const missingScreenInstitution=Boolean(screenSnapshot&&(screenSnapshot.pots.length>0||screenSnapshot.accounts.length>0)&&!screenSnapshot.institution?.trim());
  const visibleInterpretations=showAllReview
    ? indexedInterpretations
    : attentionInterpretations.length
      ? attentionInterpretations
      : indexedInterpretations.slice(0,3);
  const hiddenReadyCount=showAllReview?0:Math.max(0,interpretations.length-visibleInterpretations.length);
  const screenResourceCount=screenSnapshot
    ? screenSnapshot.accounts.length+screenSnapshot.pots.length+screenSnapshot.cards.length+screenSnapshot.commitments.length
    : 0;
  const totalOrganizedCount=interpretations.length+screenResourceCount;
  const organizedLabel = interpretations.length === 0&&screenResourceCount
    ? l(`${screenResourceCount} item${screenResourceCount===1?'':'s'} da sua vida financeira`,`${screenResourceCount} item${screenResourceCount===1?'':'s'} from your financial life`,`${screenResourceCount} elemento${screenResourceCount===1?'':'s'} de tu vida financiera`)
    : interpretations.length === 1
    ? (interpretations[0].kind === 'commitment'
        ? l('Conta para pagar','Bill to pay','Cuenta por pagar')
        : interpretations[0].direction === 'income'
          ? l('Dinheiro que entrou','Money received','Dinero que entró')
          : interpretations[0].direction === 'transfer'
            ? l('Dinheiro entre suas contas','Money between your accounts','Dinero entre tus cuentas')
            : l('Dinheiro que saiu','Money spent','Dinero que salió'))
    : l(`${interpretations.length} coisas organizadas`,`${interpretations.length} items organized`,`${interpretations.length} elementos organizados`);

  return <>
    {showTrigger&&<button className="capture-fab" onClick={() => setOpen(true)} aria-label={t.add}>＋ <span>{t.add}</span></button>}
    {open && <div className="sheet-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && reset()}>
      <section className="capture-sheet" role="dialog" aria-modal="true" aria-label={t.captureTitle}>
        {!interpretations.length&&!screenSnapshot ? <>
          <div className="sheet-handle" />
          <div className="eyebrow">{l('Jogue aqui. A gente organiza.','Drop it here. We organize it.','Déjalo aquí. Lo organizamos.')}</div>
          <h2>{l('O que aconteceu?','What happened?','¿Qué pasó?')}</h2>
          <p>{l('Escreva, fale, mande um print ou um arquivo. Você não precisa decidir antes se foi dinheiro que entrou, saiu ou uma conta para pagar.','Write, speak, send a screenshot or a file. You do not need to decide first whether money came in, went out, or is a bill to pay.','Escribe, habla, envía una captura o un archivo. No necesitas decidir antes si entró dinero, salió o es una cuenta por pagar.')}</p>

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
        </> : <>
          <div className="sheet-handle" />
          <div className="eyebrow">{t.understood}</div>
          <h2>{interpretations.length === 1&&screenResourceCount===0
            ? interpretations[0].description
            : `Encontrei ${totalOrganizedCount} item${totalOrganizedCount===1?'':'s'} nesta tela`}</h2>

          <div className="evidence-stack" aria-label={l('Como o NestBalance entendeu','How NestBalance understood it','Cómo lo entendió NestBalance')}>
            <div>
              <span>{l('VOCÊ MANDOU','YOU SENT','ENVIASTE')}</span>
              <strong>{file ? file.name : l('Texto enviado','Text sent','Texto enviado')}</strong>
              <small>{file ? (preparedEvidenceId ? l('Original já guardado e preservado.','Original already saved and preserved.','Original ya guardado y preservado.') : l('O arquivo será preservado sem alterações.','The file will be preserved unchanged.','El archivo se conservará sin cambios.')) : text.length > 80 ? `${text.slice(0, 80)}…` : text}</small>
            </div>
            <div>
              <span>{l('O NESTBALANCE ENTENDEU','NESTBALANCE UNDERSTOOD','NESTBALANCE ENTENDIÓ')}</span>
              <strong>{interpretations.length === 1&&screenResourceCount===0
                ? `${interpretations[0].description} · ${formatMoney(interpretations[0].money.amountMinor)}`
                : l(`${totalOrganizedCount} itens separados por tipo`,`${totalOrganizedCount} items separated by type`,`${totalOrganizedCount} elementos separados por tipo`)}</strong>
              <small>{geminiUsed
                ? l('Gemini sobre OCR sanitizado; imagem não enviada. Confirme antes de guardar.','Gemini used sanitized OCR; the image was not sent. Confirm before saving.','Gemini usó OCR sanitizado; la imagen no se envió. Confirma antes de guardar.')
                : aiAnalysis
                  ? l('Interpretação por IA; confirme antes de guardar.','AI interpretation; confirm before saving.','Interpretación por IA; confirma antes de guardar.')
                  : analysis?.state === 'extracted'
                    ? l('Leitura local/determinística; sem IA remota.','Local/deterministic reading; no remote AI.','Lectura local/determinista; sin IA remota.')
                    : reviewCount
                      ? l(`${reviewCount} precisa${reviewCount > 1 ? 'm' : ''} de conferência.`,`${reviewCount} item${reviewCount===1?' needs':'s need'} review.`,`${reviewCount} elemento${reviewCount===1?' necesita':'s necesitan'} revisión.`)
                      : l('Os dados principais estão claros.','The main data is clear.','Los datos principales están claros.')}</small>
            </div>
            <div>
              <span>{l('VAI FICAR ASSIM','IT WILL BE SAVED AS','SE GUARDARÁ ASÍ')}</span>
              <strong>{organizedLabel}</strong>
              <small>{file ? l('Documento e registro ficarão ligados entre si.','The document and record will stay linked.','El documento y el registro quedarán vinculados.') : l('Você poderá corrigir isso depois sem perder o original.','You can correct this later without losing the original.','Podrás corregirlo después sin perder el original.')}</small>
            </div>
          </div>

          {screenSnapshot&&<div className="financial-screen-summary">
            <div className="financial-screen-summary-head">
              <span>{screenSnapshot.institution||l('Tela financeira','Financial screen','Pantalla financiera')}</span>
              <strong>{l('Entendi o que cada número significa.','I understood what each number means.','Entendí qué significa cada número.')}</strong>
            </div>
            <div className="financial-screen-chips">
              {screenSnapshot.accounts.length>0&&<span><b>{screenSnapshot.accounts.length}</b> {l(screenSnapshot.accounts.length===1?'saldo':'saldos',screenSnapshot.accounts.length===1?'balance':'balances',screenSnapshot.accounts.length===1?'saldo':'saldos')}</span>}
              {screenSnapshot.pots.length>0&&<span><b>{screenSnapshot.pots.length}</b> {l('dinheiro guardado','saved money','dinero guardado')}</span>}
              {screenSnapshot.cards.length>0&&<span><b>{screenSnapshot.cards.length}</b> {l(screenSnapshot.cards.length===1?'cartão':'cartões',screenSnapshot.cards.length===1?'card':'cards',screenSnapshot.cards.length===1?'tarjeta':'tarjetas')}</span>}
              {screenSnapshot.commitments.length>0&&<span><b>{screenSnapshot.commitments.length}</b> {l('conta / parcela','bill / installment','cuenta / cuota')}</span>}
              {interpretations.length>0&&<span><b>{interpretations.length}</b> {l(interpretations.length===1?'movimento':'movimentos',interpretations.length===1?'movement':'movements',interpretations.length===1?'movimiento':'movimientos')}</span>}
            </div>
            {screenSnapshot.accounts.length>0&&screenSnapshot.pots.length===0&&<div className="screen-pot-source-confirm">
              <label htmlFor="screen-account-institution">{l('De qual banco é este saldo?','Which bank is this balance from?','¿De qué banco es este saldo?')}</label>
              <input
                id="screen-account-institution"
                className="pot-text-input"
                value={screenSnapshot.institution||''}
                onChange={event=>setScreenSnapshot(current=>current?{...current,institution:event.target.value.slice(0,120)}:current)}
                placeholder={l('Ex.: Mercado Pago, Bradesco, Nubank…','E.g. Mercado Pago, Bradesco, Nubank…','Ej.: Mercado Pago, Bradesco, Nubank…')}
                maxLength={120}
                autoComplete="organization"
              />
              <small>{l('Uso isso para não misturar o saldo de bancos diferentes. Se eu reconhecer a instituição pela imagem, você ainda pode corrigir aqui.','I use this to avoid mixing balances from different banks. If I recognize the institution from the image, you can still correct it here.','Lo uso para no mezclar saldos de bancos distintos. Si reconozco la institución en la imagen, todavía puedes corregirla aquí.')}</small>
            </div>}

            {screenSnapshot.accounts.length>0&&<div className="screen-pot-review">
              {screenSnapshot.accounts.map((account,index)=><div className="screen-pot-review-row" key={index}>
                <div>
                  <strong>{account.name}</strong>
                  <span>{l('Saldo principal encontrado','Primary balance found','Saldo principal encontrado')}</span>
                </div>
                <div>
                  <label className="screen-money-edit">
                    <span>{l('Saldo','Balance','Saldo')}</span>
                    <input
                      inputMode="decimal"
                      defaultValue={moneyInputValue(account.balanceMinor)}
                      aria-label={l('Saldo identificado','Detected balance','Saldo identificado')}
                      onBlur={event=>{
                        const parsed=readEditedMoney(event.currentTarget.value,true);
                        if(parsed===null) return;
                        setScreenSnapshot(current=>current?{...current,accounts:current.accounts.map((item,itemIndex)=>itemIndex===index?{...item,balanceMinor:parsed}:item)}:current);
                      }}
                    />
                  </label>
                  <small>{screenSnapshot.institution||l('Instituição não confirmada','Institution not confirmed','Institución no confirmada')}</small>
                </div>
              </div>)}
            </div>}

            {screenSnapshot.pots.length>0&&<>
              <div className="screen-pot-source-confirm">
                <label htmlFor="screen-pot-institution">{l('Banco ou origem destes cofrinhos','Bank or source of these savings pots','Banco u origen de estas alcancías')}</label>
                <input
                  id="screen-pot-institution"
                  className="pot-text-input"
                  value={screenSnapshot.institution||''}
                  onChange={event=>setScreenSnapshot(current=>current?{...current,institution:event.target.value.slice(0,120)}:current)}
                  placeholder={l('Ex.: Mercado Pago','E.g. Mercado Pago','Ej.: Mercado Pago')}
                  maxLength={120}
                  autoComplete="organization"
                />
                <small>{l('Confira a origem antes de guardar. O campo fica aberto enquanto você digita e pode ser corrigido mesmo quando eu reconhecer o banco sozinho.','Review the source before saving. The field stays open while you type and can be corrected even when I recognize the bank automatically.','Revisa el origen antes de guardar. El campo permanece abierto mientras escribes y puede corregirse incluso cuando reconozco el banco automáticamente.')}</small>
              </div>
              <div className="screen-pot-review">
              {screenSnapshot.pots.map((pot,index)=><div className="screen-pot-review-row screen-pot-review-editable" key={index}>
                <div>
                  <input
                    className="pot-inline-name"
                    value={pot.name}
                    maxLength={120}
                    aria-label={l('Nome do cofrinho','Savings pot name','Nombre de la alcancía')}
                    onChange={event=>setScreenSnapshot(current=>current?{...current,pots:current.pots.map((item,itemIndex)=>itemIndex===index?{...item,name:event.target.value}:item)}:current)}
                  />
                  <span>{screenSnapshot.institution||l('Origem não identificada','Source not identified','Origen no identificado')}</span>
                </div>
                <div>
                  <label className="screen-money-edit">
                    <span>{l('Guardado','Saved','Guardado')}</span>
                    <input
                      inputMode="decimal"
                      defaultValue={moneyInputValue(pot.balanceMinor)}
                      aria-label={l('Valor guardado','Saved amount','Valor guardado')}
                      onBlur={event=>{
                        const parsed=readEditedMoney(event.currentTarget.value,true);
                        if(parsed===null) return;
                        setScreenSnapshot(current=>current?{...current,pots:current.pots.map((item,itemIndex)=>itemIndex===index?{...item,balanceMinor:parsed}:item)}:current);
                      }}
                    />
                  </label>
                  <small>{pot.goalMinor&&pot.goalMinor>0?l(`Meta ${formatMoney(pot.goalMinor)}`,`Goal ${formatMoney(pot.goalMinor)}`,`Meta ${formatMoney(pot.goalMinor)}`):l('Sem meta encontrada','No goal found','Sin meta encontrada')}</small>
                </div>
              </div>)}
            </div></>}

            {screenSnapshot.commitments.length>0&&<div className="screen-pot-review screen-commitment-review">
              {screenSnapshot.commitments.map((commitment,index)=><div className="screen-pot-review-row screen-pot-review-editable" key={index}>
                <div>
                  <input
                    className="pot-inline-name"
                    value={commitment.description}
                    maxLength={120}
                    aria-label={l('Nome da conta','Bill name','Nombre de la cuenta')}
                    onChange={event=>setScreenSnapshot(current=>current?{...current,commitments:current.commitments.map((item,itemIndex)=>itemIndex===index?{...item,description:event.target.value}:item)}:current)}
                  />
                  <span>{commitment.recurring?l('Repete todo mês','Repeats monthly','Se repite cada mes'):l('Conta para pagar','Bill to pay','Cuenta por pagar')}</span>
                </div>
                <div className="screen-commitment-value">
                  <label className="screen-money-edit">
                    <span>{l('Valor','Amount','Valor')}</span>
                    <input
                      inputMode="decimal"
                      defaultValue={moneyInputValue(commitment.amountMinor)}
                      aria-label={l('Valor da conta','Bill amount','Valor de la cuenta')}
                      onBlur={event=>{
                        const parsed=readEditedMoney(event.currentTarget.value);
                        if(parsed===null) return;
                        setScreenSnapshot(current=>current?{...current,commitments:current.commitments.map((item,itemIndex)=>itemIndex===index?{...item,amountMinor:parsed}:item)}:current);
                      }}
                    />
                  </label>
                  <label>
                    <span>{l('Dia','Day','Día')}</span>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={commitment.dueDay??''}
                      placeholder="—"
                      aria-label={l('Dia do vencimento','Due day','Día de vencimiento')}
                      onChange={event=>{
                        const parsed=Number(event.target.value);
                        const dueDay=event.target.value===''?null:Number.isInteger(parsed)&&parsed>=1&&parsed<=31?parsed:null;
                        setScreenSnapshot(current=>current?{...current,commitments:current.commitments.map((item,itemIndex)=>itemIndex===index?{...item,dueDay}:item)}:current);
                      }}
                    />
                  </label>
                </div>
              </div>)}
            </div>}
            <small>{l('Saldo, limite e dinheiro guardado não viram gasto. Só o que representa movimento ou conta entra nessa categoria.','Balance, card limit and saved money do not become expenses. Only movements and bills are counted that way.','El saldo, el límite y el dinero guardado no se convierten en gastos. Solo los movimientos y las cuentas entran en esa categoría.')}</small>
          </div>}

          {localOcrText&&file?.type.startsWith('image/')&&<details className="capture-reclassify capture-reclassify-details">
            <summary>{l('Entendi o tipo do print errado?','Did I get the screenshot type wrong?','¿Entendí mal el tipo de la captura?')}</summary>
            <div>
              <button type="button" disabled={working} onClick={()=>reprocessLocalAs('recurring')}>{l('Contas recorrentes','Recurring bills','Cuentas recurrentes')}</button>
              <button type="button" disabled={working} onClick={()=>reprocessLocalAs('pots')}>{l('Cofrinhos','Savings pots','Alcancías')}</button>
              <button type="button" disabled={working} onClick={()=>reprocessLocalAs('balance')}>{l('Saldo da conta','Account balance','Saldo de la cuenta')}</button>
            </div>
          </details>}

          {matchingPayments&&interpretations.length===1&&<p className="confidence-note" role="status">{l('Conferindo se isso paga alguma conta que já estava na sua lista…','Checking whether this pays a bill already on your list…','Comprobando si esto paga alguna cuenta que ya estaba en tu lista…')}</p>}

          {paymentMatches.length>0&&!paymentMatchDismissed&&<div className="payment-match-panel">
            <div>
              <span>{paymentMatches.length===1?l('Parece que encontramos a conta','Looks like we found the bill','Parece que encontramos la cuenta'):l('Qual conta você pagou?','Which bill did you pay?','¿Qué cuenta pagaste?')}</span>
              <strong>{paymentMatches.length===1?l('Isso pode quitar algo que já estava pendente.','This may settle something that was already pending.','Esto puede liquidar algo que ya estaba pendiente.'):l('Há mais de uma conta parecida. Escolha só se tiver certeza.','There is more than one similar bill. Choose only if you are sure.','Hay más de una cuenta parecida. Elige solo si estás seguro.')}</strong>
            </div>
            <div className="payment-match-options">
              {paymentMatches.map(candidate=><button
                key={candidate.commitment.id}
                type="button"
                disabled={Boolean(payingMatchId)}
                onClick={()=>void confirmMatchedPayment(candidate)}
              >
                <span>{candidate.commitment.dueDay?l('Dia '+candidate.commitment.dueDay,'Day '+candidate.commitment.dueDay,'Día '+candidate.commitment.dueDay):l('Na sua lista','On your list','En tu lista')}</span>
                <strong>{candidate.commitment.description}</strong>
                <b>{formatMoney(candidate.commitment.amountMinor)}</b>
                <em>{payingMatchId===candidate.commitment.id?l('Marcando…','Marking…','Marcando…'):l('Marcar como pago','Mark as paid','Marcar como pagado')}</em>
              </button>)}
            </div>
            <button type="button" className="payment-match-none" disabled={Boolean(payingMatchId)} onClick={()=>setPaymentMatchDismissed(true)}>
              {l('Nenhuma dessas','None of these','Ninguna de estas')}
            </button>
          </div>}

          {interpretations.length>1&&<div className="capture-review-summary">
            <div><strong>{readyInterpretations.length}</strong><span>{l(readyInterpretations.length===1?'já organizado':'já organizados','already organized',readyInterpretations.length===1?'ya organizado':'ya organizados')}</span></div>
            <div className={attentionInterpretations.length?'attention':''}><strong>{attentionInterpretations.length}</strong><span>{l('para conferir','to review','para revisar')}</span></div>
          </div>}

          <div className="review-list">{visibleInterpretations.map(({item:interpretation,index}) => <div className={interpretation.needsReview.includes('direction')?'interpretation-card needs-choice':'interpretation-card'} key={`${interpretation.description}-${index}`}>
            <div><strong>{interpretation.description}</strong><b>{formatMoney(interpretation.money.amountMinor)}</b></div>
            <span>{interpretation.kind === 'commitment'
              ? (interpretation.recurring ? l(`Todo mês${interpretation.dueDay ? ` · dia ${interpretation.dueDay}` : ''}`,`Every month${interpretation.dueDay ? ` · day ${interpretation.dueDay}` : ''}`,`Cada mes${interpretation.dueDay ? ` · día ${interpretation.dueDay}` : ''}`) : l('Conta para pagar','Bill to pay','Cuenta por pagar'))
              : interpretation.needsReview.includes('direction')
                ? l('Só falta dizer se entrou ou saiu','Just tell me whether it came in or went out','Solo falta decir si entró o salió')
                : interpretation.direction==='income'
                  ? l('Dinheiro que entrou','Money received','Dinero que entró')
                  : interpretation.direction==='transfer'
                    ? l('Só mudou de conta','It only moved accounts','Solo cambió de cuenta')
                    : l('Dinheiro que saiu','Money spent','Dinero que salió')}
              {interpretation.occurredOn?` · ${formatDate(new Date(interpretation.occurredOn+'T12:00:00'),{day:'2-digit',month:'2-digit'})}`:''}
            </span>
            {interpretation.installment && <span>{l(`Parcela ${interpretation.installment.current} de ${interpretation.installment.total}`,`Installment ${interpretation.installment.current} of ${interpretation.installment.total}`,`Cuota ${interpretation.installment.current} de ${interpretation.installment.total}`)}</span>}
            {interpretation.needsReview.includes('direction')
              ? <div className="inline-direction-choice">
                  <button type="button" onClick={()=>chooseImportedDirection(index,'expense')}>{l('Eu paguei','I paid','Yo pagué')}</button>
                  <button type="button" onClick={()=>chooseImportedDirection(index,'income')}>{l('Eu recebi','I received','Yo recibí')}</button>
                  <button type="button" onClick={()=>chooseImportedDirection(index,'transfer')}>{l('Mudou de conta','Moved accounts','Cambió de cuenta')}</button>
                </div>
              : interpretation.confidence !== 'high' && <em>{l('Confira este item','Review this item','Revisa este elemento')}</em>}
          </div>)}</div>

          {hiddenReadyCount>0&&<button type="button" className="capture-show-all" onClick={()=>setShowAllReview(true)}>
            {l(`Ver ${hiddenReadyCount} item${hiddenReadyCount===1?'':'s'} já organizado${hiddenReadyCount===1?'':'s'}`,`View ${hiddenReadyCount} already organized item${hiddenReadyCount===1?'':'s'}`,`Ver ${hiddenReadyCount} elemento${hiddenReadyCount===1?'':'s'} ya organizado${hiddenReadyCount===1?'':'s'}`)}
          </button>}
          {showAllReview&&interpretations.length>3&&<button type="button" className="capture-show-all" onClick={()=>setShowAllReview(false)}>
            {l('Mostrar só o que importa','Show only what matters','Mostrar solo lo que importa')}
          </button>}

          {reviewCount > 0 && <p className="confidence-note">{unresolvedDirectionCount
            ? l(`Só ${unresolvedDirectionCount} item${unresolvedDirectionCount===1?' precisa':'s precisam'} de uma resposta rápida. O restante já está organizado.`,`Only ${unresolvedDirectionCount} item${unresolvedDirectionCount===1?' needs':'s need'} a quick answer. The rest is already organized.`,`Solo ${unresolvedDirectionCount} elemento${unresolvedDirectionCount===1?' necesita':'s necesitan'} una respuesta rápida. El resto ya está organizado.`)
            : l('O que estava claro já foi organizado. Confira apenas os itens sinalizados.','What was clear is already organized. Review only the flagged items.','Lo que estaba claro ya está organizado. Revisa solo los elementos señalados.')}</p>}
          {upload && <div className="upload-status" role="status" aria-live="polite">
            <div><span>{upload.phase === 'uploading' ? l('Guardando original…','Saving original…','Guardando original…') : l('Conferindo arquivo…','Checking file…','Revisando archivo…')}</span><b>{upload.percent}%</b></div>
            <progress max="100" value={upload.percent}>{upload.percent}%</progress>
          </div>}
          {notice && <p className="notice-copy" role="status">{notice}</p>}
          {error && <p className="error-copy" role="alert">{error}</p>}

          <div className="sheet-actions">
            <button className="ghost-button" disabled={working} onClick={()=>{ setInterpretations([]); setScreenSnapshot(null); setUpload(null); }}>{l('Corrigir','Correct','Corregir')}</button>
            <button className="primary-button" disabled={working||unresolvedDirectionCount>0||Boolean(missingScreenInstitution)||(paymentMatches.length>0&&!paymentMatchDismissed)} onClick={confirm}>{saving
              ? (upload?.phase === 'verifying' ? l('Conferindo…','Checking…','Revisando…') : l('Guardando…','Saving…','Guardando…'))
              : unresolvedDirectionCount
                ? l(`Falta ${unresolvedDirectionCount} confirmação${unresolvedDirectionCount===1?'':'ões'}`,`${unresolvedDirectionCount} confirmation${unresolvedDirectionCount===1?'':'s'} remaining`,`Falta${unresolvedDirectionCount===1?'':'n'} ${unresolvedDirectionCount} confirmación${unresolvedDirectionCount===1?'':'es'}`)
                : missingScreenInstitution
                ? l('Informe o banco ou origem acima','Enter the bank or source above','Indica el banco u origen arriba')
                : paymentMatches.length>0&&!paymentMatchDismissed
                  ? l('Escolha a conta acima','Choose the bill above','Elige la cuenta de arriba')
                  : l('Guardar','Save','Guardar')}</button>
          </div>
        </>}
      </section>
    </div>}
  </>;
}
