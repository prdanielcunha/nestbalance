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
import type { FinancialScope } from '@/src/core/privacy';
import { readImageTextLocally } from '@/src/lib/local-image-ocr';
import { analyzeTextWithGeminiFallback, getGeminiFallbackStatus, type GeminiFallbackStatus } from '@/src/lib/repositories/gemini-fallback';
import { consumeWebShareTarget } from '@/src/lib/pwa/share-target';
import { reportProductEvent, type CaptureCorrectionReason, type CaptureSourceKind } from '@/src/lib/product-events';
import type { CaptureProgressStage } from '@/src/features/capture/capture-progress';
import { undoCaptureBatch, type CaptureUndoItem } from '@/src/lib/repositories/capture-undo';
import { publishToast } from '@/src/features/feedback/toast-store';
import { endCaptureTrace, startCaptureTrace } from '@/src/lib/capture-trace';

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

export function useUniversalCaptureController({ householdId, uid, onCommitted, defaultOpen=false, onClose }: { householdId: string; uid: string; onCommitted?: () => void; defaultOpen?: boolean; onClose?: () => void }) {
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
  const captureStartedAtRef=useRef<number|null>(null);
  const reviewReportedRef=useRef(false);
  const correctionReportedRef=useRef<Set<CaptureCorrectionReason>>(new Set());

  useEffect(()=>{
    if(!open) return;
    startCaptureTrace();
    return ()=>endCaptureTrace();
  },[open]);

  const working = saving || analyzing || recording || geminiWorking;
  const moneyInputValue=(minor:number)=>(minor/100).toLocaleString(intlLocale,{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});

  function captureSourceKind():CaptureSourceKind{
    if(file?.type.startsWith('image/')) return 'image';
    if(file?.type.startsWith('audio/')) return 'audio';
    if(file&&/\.pdf$/i.test(file.name)) return 'pdf';
    if(file&&/\.csv$/i.test(file.name)) return 'csv';
    if(text.trim()) return 'text';
    return 'other';
  }

  function captureDurationMs(){
    return captureStartedAtRef.current===null?undefined:Math.max(0,performance.now()-captureStartedAtRef.current);
  }

  function reportCaptureCorrection(correction:CaptureCorrectionReason){
    if(correctionReportedRef.current.has(correction)) return;
    correctionReportedRef.current.add(correction);
    reportProductEvent('capture_corrected',{
      source:captureSourceKind(),
      durationMs:captureDurationMs(),
      correction
    });
  }

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
    if(captureStartedAtRef.current===null){
      captureStartedAtRef.current=performance.now();
      reviewReportedRef.current=false;
      reportProductEvent('capture_opened');
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !working) reset(); };
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
    const shareTargetId=params.get('shareTarget')||'';
    if(!shareTargetId) return;
    let cancelled=false;
    void (async()=>{
      try{
        const shared=await consumeWebShareTarget(shareTargetId);
        if(cancelled||!shared) return;
        const url=new URL(window.location.href);
        url.searchParams.delete('shareTarget');
        window.history.replaceState(null,'',url.pathname+(url.search?url.search:'')+url.hash);
        if(shared.file){
          selectFile(shared.file,l(
            shared.fileCount>1?'Recebi os arquivos compartilhados. Vou começar pelo primeiro.':'Recebi o arquivo compartilhado. Já estou organizando.',
            shared.fileCount>1?'I received the shared files. I will start with the first one.':'I received the shared file. I am organizing it now.',
            shared.fileCount>1?'Recibí los archivos compartidos. Empezaré por el primero.':'Recibí el archivo compartido. Ya lo estoy organizando.'
          ));
          void interpret(shared.file);
          return;
        }
        const sharedText=[shared.title,shared.text,shared.url].filter(Boolean).join('\n').trim();
        if(sharedText){
          setText(sharedText);
          setNotice(l('Recebi o conteúdo compartilhado. Confira e toque em organizar.','I received the shared content. Review it and tap organize.','Recibí el contenido compartido. Revísalo y toca organizar.'));
        }
      }catch{
        if(!cancelled) setError(l('Não consegui abrir o conteúdo compartilhado. Você ainda pode colar ou escolher o arquivo aqui.','I could not open the shared content. You can still paste or choose the file here.','No pude abrir el contenido compartido. Aún puedes pegar o elegir el archivo aquí.'));
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
    captureStartedAtRef.current=null;
    reviewReportedRef.current=false;
    correctionReportedRef.current.clear();
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
    if(captureStartedAtRef.current!==null){
      reportProductEvent('capture_abandoned',{
        source:captureSourceKind(),
        durationMs:captureDurationMs()
      });
    }
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
    reportCaptureCorrection('source_type');
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
    reportCaptureCorrection('value_field');
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
    reportCaptureCorrection('direction');
    prepareAiReview(pendingAi.extraction,pendingAi.amountMinor,direction);
  }

  function chooseImportedDirection(index:number,direction:ConfirmedDirection){
    reportCaptureCorrection('direction');
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
      reportProductEvent('capture_committed',{
        source:captureSourceKind(),
        durationMs:captureDurationMs(),
        itemCount:Math.max(1,interpretations.length),
        reviewCount:interpretations.filter(item=>item.confidence!=='high'||item.needsReview.length>0).length
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
      const createdEntities:CaptureUndoItem[]=[];
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
      let queued = 0;
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
        else if(result.status === 'queued') queued++;
        else{
          created++;
          createdEntities.push({
            id:result.id,
            entityType:interpretations[i].kind==='commitment'?'commitment':'transaction'
          });
        }
      }
      if (duplicates && !created && !queued) {
        setNotice(l('Isso já parece estar registrado. Não criamos uma cópia.','This already appears to be recorded. We did not create a copy.','Esto ya parece estar registrado. No creamos una copia.'));
        setSaving(false);
        setUpload(null);
        return;
      }
      const committedSourceKind=captureSourceKind();
      reportProductEvent(queued>0?'capture_queued':'capture_committed',{
        source:committedSourceKind,
        durationMs:captureDurationMs(),
        itemCount:Math.max(1,interpretations.length+(screenSnapshot?screenSnapshot.accounts.length+screenSnapshot.pots.length+screenSnapshot.cards.length+screenSnapshot.commitments.length:0)),
        reviewCount
      });
      if(createdEntities.length>0&&!screenSnapshot&&queued===0){
        const undoItems=[...createdEntities];
        publishToast({
          message:l(
            createdEntities.length===1?'Item salvo.':'Itens salvos.',
            createdEntities.length===1?'Item saved.':'Items saved.',
            createdEntities.length===1?'Elemento guardado.':'Elementos guardados.'
          ),
          actionLabel:l('Desfazer','Undo','Deshacer'),
          onAction:async()=>{
            try{
              await undoCaptureBatch(householdId,undoItems);
              reportProductEvent('capture_undone',{
                source:committedSourceKind,
                itemCount:undoItems.length
              });
              publishToast({message:l('Desfeito.','Undone.','Deshecho.'),durationMs:3500});
            }catch{
              publishToast({message:l('Não conseguimos desfazer agora.','We could not undo that right now.','No pudimos deshacerlo ahora.'),durationMs:5000});
            }
          }
        });
      }
      clearAll();
      onCommitted?.();
    } catch {
      setError(l('Não conseguimos salvar isso agora. Nada foi marcado como concluído.','We could not save this right now. Nothing was marked as completed.','No pudimos guardar esto ahora. Nada se marcó como completado.'));
    } finally {
      setSaving(false);
    }
  }

  const captureStage:CaptureProgressStage=upload
    ? 'receiving'
    : localOcrPercent>0
      ? 'reading'
      : matchingPayments
        ? 'comparing'
        : analyzing||geminiWorking
          ? 'understanding'
          : interpretations.length||screenSnapshot
            ? 'ready'
            : 'receiving';
  const captureStageLabels:Record<CaptureProgressStage,string>={
    receiving:l('Recebendo','Receiving','Recibiendo'),
    reading:l('Lendo','Reading','Leyendo'),
    understanding:l('Entendendo','Understanding','Entendiendo'),
    comparing:l('Comparando','Comparing','Comparando'),
    ready:l('Pronto','Ready','Listo')
  };
  function editInterpretation(index:number,update:(current:FinancialInterpretation)=>FinancialInterpretation){
    setInterpretations(current=>current.map((item,itemIndex)=>itemIndex===index?update(item):item));
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
  useEffect(()=>{
    if(!open||totalOrganizedCount===0||reviewReportedRef.current) return;
    reviewReportedRef.current=true;
    reportProductEvent('capture_review_ready',{
      source:captureSourceKind(),
      durationMs:captureDurationMs(),
      itemCount:totalOrganizedCount,
      reviewCount
    });
  },[open,totalOrganizedCount,reviewCount,file,text]);

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

  return {
    t,l,formatMoney,formatDate,
    open,setOpen,working,file,scope,setScope,preparedEvidenceId,
    recording,saving,analyzing,startRecording,stopRecording,
    imageInputRef,fileInputRef,textRef,pasteImageFromClipboard,selectFile,interpret,
    localOcrText,reprocessLocalAs,text,setText,setFile,setPreparedEvidenceId,setAnalysis,setAiAnalysis,setNotice,
    upload,localOcrPercent,analysis,amountChoices,chooseAmount,directionChoice,chooseDirection,
    geminiUsed,aiAnalysis,geminiStatus,screenSnapshot,setScreenSnapshot,geminiWorking,runGeminiFallback,
    notice,error,reset,captureStage,captureStageLabels,interpretations,screenResourceCount,totalOrganizedCount,reviewCount,organizedLabel,
    readEditedMoney,moneyInputValue,matchingPayments,paymentMatches,paymentMatchDismissed,payingMatchId,
    confirmMatchedPayment,setPaymentMatchDismissed,readyInterpretations,attentionInterpretations,visibleInterpretations,
    editInterpretation,reportCaptureCorrection,chooseImportedDirection,hiddenReadyCount,setShowAllReview,showAllReview,
    unresolvedDirectionCount,setInterpretations,setUpload,missingScreenInstitution,confirm
  };
}

export type UniversalCaptureController=ReturnType<typeof useUniversalCaptureController>;
