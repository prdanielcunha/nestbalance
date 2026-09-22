'use client';
import { useEffect, useRef, useState } from 'react';
import { parseFinancialList } from '@/src/core/text-parser';
import { buildImportedMovements, resolveImportedMovementDirection } from '@/src/core/movement-import';
import { parseFinancialCsv } from '@/src/core/csv-import';
import type { FinancialInterpretation } from '@/src/core/types';
import { sourceTextForChosenDocumentAmount, suggestCaptureFromDocument } from '@/src/core/document-suggestion';
import { detectDocumentSignals } from '@/src/core/document-signals';
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
import { messages } from '@/src/i18n/messages';
import { ScopeChoice } from '@/src/features/privacy/scope-choice';
import type { FinancialScope } from '@/src/core/privacy';
import { readImageTextLocally } from '@/src/lib/local-image-ocr';
import { analyzeTextWithGeminiFallback, getGeminiFallbackStatus, type GeminiFallbackStatus } from '@/src/lib/repositories/gemini-fallback';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
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
  const t = messages['pt-BR'];
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
  const imageInputRef=useRef<HTMLInputElement|null>(null);
  const fileInputRef=useRef<HTMLInputElement|null>(null);
  const textRef=useRef<HTMLTextAreaElement|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const recorderChunksRef=useRef<BlobPart[]>([]);
  const recorderStreamRef=useRef<MediaStream|null>(null);

  const working = saving || analyzing || recording || geminiWorking;

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
      selectFile(fileFromClipboard,'Print colado. Já estou organizando.');
      void interpret(fileFromClipboard);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste',onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste',onPaste);
    };
  }, [open, working]);

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
    setError('');
    setNotice(noticeText);
  }

  async function startRecording(){
    if(recording||working) return;
    setError('');
    setNotice('');
    if(typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
      setError('Este aparelho não liberou gravação direta. Você ainda pode enviar um áudio já gravado.');
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
        selectFile(recorded,'Áudio recebido. Já estou organizando.');
        void interpret(recorded);
      };
      recorder.start();
      setRecording(true);
      setNotice('Pode falar do seu jeito. Quando terminar, toque em “Terminar áudio”.');
    }catch{
      stopRecorderTracks();
      setRecording(false);
      setError('Não consegui acessar o microfone. Você pode enviar um áudio já gravado.');
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
      setNotice(candidates.length?'Encontrei mais de um valor possível. Qual representa esta movimentação?':'Li a imagem, mas não encontrei um valor confiável. Você pode escrever o que aconteceu acima.');
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
      setNotice('Encontrei o valor. Só preciso saber como esse dinheiro se moveu.');
      return;
    }

    const sourceText=sourceTextFromAiExtraction(extraction,{amountMinor,direction});
    if(!sourceText){
      setError('Consegui ler a imagem, mas ainda preciso que você descreva esse movimento.');
      return;
    }
    applySourceText(sourceText,true);
    setNotice('Li a imagem com inteligência visual. Confira antes de guardar.');
  }

  async function interpret(overrideFile?:File) {
    setError('');
    setNotice('');
    setAmountChoices([]);
    setDirectionChoice(false);

    const activeFile=overrideFile??file;

    if (!overrideFile&&text.trim()) {
      try { applySourceText(text); }
      catch { setError('Conte o que aconteceu e, se souber, o valor.'); }
      return;
    }

    if (!activeFile) {
      setError('Escreva, fale, cole um print ou escolha um arquivo.');
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
                ? `Entendi esta tela e organizei o que estava claro. Só ${unresolved} movimentação${unresolved===1?' precisa':' precisam'} de uma resposta rápida.`
                : 'Entendi a tela financeira. Saldo, dinheiro guardado, contas, cartão e movimentos ficam separados corretamente.');
              return;
            }
          }
          if(ai.kind==='audio'){
            const transcript=ai.transcript?.trim()||'';
            if(!transcript||!ai.parsedInterpretations?.length){
              setNotice('Áudio transcrito, mas não encontrei uma movimentação clara. Você pode ajustar o texto acima.');
              if(transcript) setText(transcript);
              return;
            }
            const audioItems=markDocumentDerived(ai.parsedInterpretations);
            setText(transcript);
            setInterpretations(audioItems);
            if(audioItems.length===1) void loadPaymentMatches(audioItems[0]);
            setNotice(ai.transcriptTruncated?'Transcrevi o áudio parcialmente. Confira antes de guardar.':'Transcrevi o áudio. Confira antes de guardar.');
            return;
          }
          if(ai.extraction){
            prepareAiReview(ai.extraction);
            return;
          }
          setNotice('O original está guardado, mas não consegui extrair dados financeiros suficientes.');
          return;
        }catch(err:any){
          if(err?.message==='AI_NOT_CONFIGURED'){
            setNotice(result.reason==='audio_input'
              ? 'Áudio guardado. A transcrição inteligente ainda não está conectada neste ambiente.'
              : 'Imagem guardada. A leitura inteligente ainda não está conectada neste ambiente.');
            return;
          }
          if(err?.message==='AI_ANALYSIS_IN_PROGRESS'){
            setNotice('Este arquivo já está sendo analisado. Toque em Entender novamente para buscar o resultado.');
            return;
          }
          throw err;
        }
      }

      if (result.state !== 'extracted') {
        setError('Guardei o original, mas não encontrei texto confiável para organizar automaticamente.');
        return;
      }

      if(/\.csv$/i.test(activeFile.name)&&result.text){
        const csv=parseFinancialCsv(result.text);
        if(csv.state==='parsed'){
          setInterpretations(csv.items);
          const attention=csv.items.filter(item=>item.needsReview.length>0).length;
          setNotice(attention
            ? `Importei ${csv.items.length} movimentações do arquivo. Só ${attention} precisa${attention===1?'':'m'} de uma conferência rápida.`
            : `Importei ${csv.items.length} movimentações do arquivo. Tudo pronto para guardar.`);
          return;
        }
      }

      const suggestion = suggestCaptureFromDocument(activeFile.name, result.signals);
      if (suggestion.state === 'suggested') {
        applySourceText(suggestion.sourceText, true);
        setNotice('Li o texto do documento sem IA. Confira antes de guardar.');
        return;
      }

      if (suggestion.state === 'choose_amount') {
        setAmountChoices(suggestion.amountsMinor);
        setNotice('Encontrei mais de um valor. Qual deles representa este pagamento?');
        return;
      }

      setNotice('Consegui ler o documento, mas não encontrei um valor claro. Diga acima o que aconteceu; o original já está guardado.');
    } catch {
      setError('Não consegui analisar esse arquivo agora. O que foi concluído com segurança não será duplicado.');
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
      setNotice('Usei o valor que você escolheu. Confira o restante antes de guardar.');
    } catch {
      setError('Não consegui preparar essa revisão.');
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
      setError('Não conseguimos ligar esse pagamento à conta agora. Você pode escolher “Nenhuma dessas” e guardar normalmente.');
    }finally{
      setPayingMatchId('');
    }
  }

  async function confirm() {
    if (!interpretations.length&&!screenSnapshot) return;
    if(paymentMatches.length&&!paymentMatchDismissed){
      setError('Escolha a conta que este pagamento quitou ou toque em “Nenhuma dessas”.');
      return;
    }
    const unresolved=interpretations.filter(item=>item.needsReview.includes('direction')).length;
    if(unresolved){
      setError(`Só falta dizer o que aconteceu em ${unresolved} item${unresolved===1?'':'s'}.`);
      return;
    }
    setSaving(true);
    setUpload(null);
    setError('');
    setNotice('');
    try {
      let created = 0;
      if(screenSnapshot&&preparedEvidenceId){
        await commitFinancialScreen({householdId,evidenceId:preparedEvidenceId,scope});
        created++;
      }
      let duplicates = 0;
      for (let i = 0; i < interpretations.length; i++) {
        const result = await commitInterpretation({
          householdId,
          uid,
          interpretation: interpretations[i],
          evidenceId: i === 0 ? preparedEvidenceId : null,
          file: i === 0 && !preparedEvidenceId ? file : null,
          onUploadProgress: progress => setUpload(progress),
          scope
        });
        if (result.status === 'duplicate') duplicates++;
        else created++;
      }
      if (duplicates && !created) {
        setNotice('Isso já parece estar registrado. Não criamos uma cópia.');
        setSaving(false);
        setUpload(null);
        return;
      }
      clearAll();
      onCommitted?.();
    } catch {
      setError('Não conseguimos salvar isso agora. Nada foi marcado como concluído.');
    } finally {
      setSaving(false);
    }
  }

  const indexedInterpretations=interpretations.map((item,index)=>({item,index}));
  const attentionInterpretations=indexedInterpretations.filter(({item})=>item.confidence!=='high'||item.needsReview.includes('direction'));
  const readyInterpretations=indexedInterpretations.filter(({item})=>item.confidence==='high'&&!item.needsReview.includes('direction'));
  const reviewCount = attentionInterpretations.length;
  const unresolvedDirectionCount=interpretations.filter(x=>x.needsReview.includes('direction')).length;
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
    ? `${screenResourceCount} item${screenResourceCount===1?'':'s'} da sua vida financeira`
    : interpretations.length === 1
    ? (interpretations[0].kind === 'commitment'
        ? 'Conta para pagar'
        : interpretations[0].direction === 'income'
          ? 'Dinheiro que entrou'
          : interpretations[0].direction === 'transfer'
            ? 'Dinheiro entre suas contas'
            : 'Dinheiro que saiu')
    : `${interpretations.length} coisas organizadas`;

  return <>
    {showTrigger&&<button className="capture-fab" onClick={() => setOpen(true)} aria-label={t.add}>＋ <span>{t.add}</span></button>}
    {open && <div className="sheet-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && reset()}>
      <section className="capture-sheet" role="dialog" aria-modal="true" aria-label={t.captureTitle}>
        {!interpretations.length&&!screenSnapshot ? <>
          <div className="sheet-handle" />
          <div className="eyebrow">Jogue aqui. A gente organiza.</div>
          <h2>O que aconteceu?</h2>
          <p>Escreva, fale, mande um print ou um arquivo. Você não precisa decidir antes se foi dinheiro que entrou, saiu ou uma conta para pagar.</p>

          <ScopeChoice value={scope} onChange={setScope} disabled={working||Boolean(preparedEvidenceId)}/>

          <div className="capture-quick-actions" aria-label="Como você quer contar">
            <button type="button" disabled={working} onClick={()=>textRef.current?.focus()}>
              <strong>Escrever</strong><span>Conte do seu jeito</span>
            </button>
            <button type="button" className={recording?'recording':''} disabled={saving||analyzing} onClick={()=>recording?stopRecording():void startRecording()}>
              <strong>{recording?'Terminar áudio':'Falar'}</strong><span>{recording?'Estou ouvindo…':'Grave na hora'}</span>
            </button>
            <button type="button" disabled={working} onClick={()=>imageInputRef.current?.click()}>
              <strong>Print ou foto</strong><span>Galeria ou câmera</span>
            </button>
            <button type="button" disabled={working} onClick={()=>fileInputRef.current?.click()}>
              <strong>Arquivo</strong><span>PDF, CSV ou áudio</span>
            </button>
          </div>

          <div className="capture-paste-hint">No computador, você também pode <strong>colar um print</strong> direto aqui.</div>

          <input
            ref={imageInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={working}
            onChange={e=>{
              const selected=e.target.files?.[0];
              if(!selected) return;
              selectFile(selected,'Imagem recebida. Já estou organizando.');
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
              selectFile(selected,'Arquivo recebido. Já estou organizando.');
              void interpret(selected);
              e.currentTarget.value='';
            }}
          />

          <label className="sr-only" htmlFor="universal-capture-text">Conte o que aconteceu</label>
          <textarea
            ref={textRef}
            id="universal-capture-text"
            value={text}
            disabled={working}
            onChange={e=>setText(e.target.value)}
            placeholder={'Ex.: Paguei 119,90 da internet\nRecebi 2.500 do trabalho\nGeladeira em 10x de 189'}
          />

          {file&&<div className="capture-selected-source">
            <span>Recebido</span>
            <strong>{file.name}</strong>
            {!working&&<button type="button" onClick={()=>{setFile(null);setPreparedEvidenceId(null);setAnalysis(null);setAiAnalysis(null);setNotice('');}}>Trocar</button>}
          </div>}

          {upload && <div className="upload-status" role="status" aria-live="polite">
            <div><span>{upload.phase === 'uploading' ? 'Guardando original…' : 'Conferindo arquivo…'}</span><b>{upload.percent}%</b></div>
            <progress max="100" value={upload.percent}>{upload.percent}%</progress>
          </div>}

          {analyzing && !upload && <p className="confidence-note" role="status">{analysis?.state==='needs_ai'?'Fazendo a leitura inteligente…':'Entendendo o documento…'}</p>}

          {amountChoices.length > 0 && <div className="amount-choice-panel">
            <span>Qual valor devo usar?</span>
            <div>{amountChoices.map(value => <button key={value} type="button" onClick={()=>chooseAmount(value)}>{money.format(value/100)}</button>)}</div>
            <small>Nenhum valor é escolhido automaticamente quando o documento é ambíguo.</small>
          </div>}

          {directionChoice && <div className="direction-choice-panel">
            <span>O que aconteceu com esse dinheiro?</span>
            <div>
              <button type="button" onClick={()=>chooseDirection('expense')}>Eu paguei</button>
              <button type="button" onClick={()=>chooseDirection('income')}>Eu recebi</button>
              <button type="button" onClick={()=>chooseDirection('transfer')}>Só mudou de conta</button>
            </div>
            <small>Se só passou de uma conta sua para outra, o NestBalance não trata como dinheiro gasto ou recebido.</small>
          </div>}

          {analysis?.state === 'extracted' && !aiAnalysis && <p className="native-analysis-note">Texto lido diretamente do documento · sem IA</p>}
          {aiAnalysis && <p className="native-analysis-note">{aiAnalysis.kind==='audio'?'Áudio transcrito com IA':'Imagem lida com IA'} · confirmação humana antes de guardar</p>}
          {notice && <p className="notice-copy" role="status">{notice}</p>}
          {error && <p className="error-copy" role="alert">{error}</p>}

          <div className="sheet-actions">
            <button className="ghost-button" disabled={working} onClick={reset}>{t.cancel}</button>
            <button className="primary-button" disabled={working || (!text.trim() && !file)} onClick={()=>void interpret()}>
              {analyzing ? 'Organizando…' : 'Organizar'}
            </button>
          </div>
        </> : <>
          <div className="sheet-handle" />
          <div className="eyebrow">{t.understood}</div>
          <h2>{interpretations.length === 1&&screenResourceCount===0
            ? interpretations[0].description
            : `Encontrei ${totalOrganizedCount} item${totalOrganizedCount===1?'':'s'} nesta tela`}</h2>

          <div className="evidence-stack" aria-label="Como o NestBalance entendeu">
            <div>
              <span>VOCÊ MANDOU</span>
              <strong>{file ? file.name : 'Texto enviado'}</strong>
              <small>{file ? (preparedEvidenceId ? 'Original já guardado e preservado.' : 'O arquivo será preservado sem alterações.') : text.length > 80 ? `${text.slice(0, 80)}…` : text}</small>
            </div>
            <div>
              <span>O NESTBALANCE ENTENDEU</span>
              <strong>{interpretations.length === 1&&screenResourceCount===0
                ? `${interpretations[0].description} · ${money.format(interpretations[0].money.amountMinor / 100)}`
                : `${totalOrganizedCount} itens separados por tipo`}</strong>
              <small>{aiAnalysis ? 'Interpretação por IA; confirme antes de guardar.' : analysis?.state === 'extracted' ? 'Leitura nativa do documento; sem IA.' : reviewCount ? `${reviewCount} precisa${reviewCount > 1 ? 'm' : ''} de conferência.` : 'Os dados principais estão claros.'}</small>
            </div>
            <div>
              <span>VAI FICAR ASSIM</span>
              <strong>{organizedLabel}</strong>
              <small>{file ? 'Documento e registro ficarão ligados entre si.' : 'Você poderá corrigir isso depois sem perder o original.'}</small>
            </div>
          </div>

          {screenSnapshot&&<div className="financial-screen-summary">
            <div className="financial-screen-summary-head">
              <span>{screenSnapshot.institution||'Tela financeira'}</span>
              <strong>Entendi o que cada número significa.</strong>
            </div>
            <div className="financial-screen-chips">
              {screenSnapshot.accounts.length>0&&<span><b>{screenSnapshot.accounts.length}</b> saldo{screenSnapshot.accounts.length===1?'':'s'}</span>}
              {screenSnapshot.pots.length>0&&<span><b>{screenSnapshot.pots.length}</b> dinheiro guardado</span>}
              {screenSnapshot.cards.length>0&&<span><b>{screenSnapshot.cards.length}</b> cartão{screenSnapshot.cards.length===1?'':'ões'}</span>}
              {screenSnapshot.commitments.length>0&&<span><b>{screenSnapshot.commitments.length}</b> conta{screenSnapshot.commitments.length===1?'':'s'} / parcela{screenSnapshot.commitments.length===1?'':'s'}</span>}
              {interpretations.length>0&&<span><b>{interpretations.length}</b> movimento{interpretations.length===1?'':'s'}</span>}
            </div>
            <small>Saldo, limite e dinheiro guardado não viram gasto. Só o que representa movimento ou conta entra nessa categoria.</small>
          </div>}

          {matchingPayments&&interpretations.length===1&&<p className="confidence-note" role="status">Conferindo se isso paga alguma conta que já estava na sua lista…</p>}

          {paymentMatches.length>0&&!paymentMatchDismissed&&<div className="payment-match-panel">
            <div>
              <span>{paymentMatches.length===1?'Parece que encontramos a conta':'Qual conta você pagou?'}</span>
              <strong>{paymentMatches.length===1?'Isso pode quitar algo que já estava pendente.':'Há mais de uma conta parecida. Escolha só se tiver certeza.'}</strong>
            </div>
            <div className="payment-match-options">
              {paymentMatches.map(candidate=><button
                key={candidate.commitment.id}
                type="button"
                disabled={Boolean(payingMatchId)}
                onClick={()=>void confirmMatchedPayment(candidate)}
              >
                <span>{candidate.commitment.dueDay?'Dia '+candidate.commitment.dueDay:'Na sua lista'}</span>
                <strong>{candidate.commitment.description}</strong>
                <b>{money.format(candidate.commitment.amountMinor/100)}</b>
                <em>{payingMatchId===candidate.commitment.id?'Marcando…':'Marcar como pago'}</em>
              </button>)}
            </div>
            <button type="button" className="payment-match-none" disabled={Boolean(payingMatchId)} onClick={()=>setPaymentMatchDismissed(true)}>
              Nenhuma dessas
            </button>
          </div>}

          {interpretations.length>1&&<div className="capture-review-summary">
            <div><strong>{readyInterpretations.length}</strong><span>já organizado{readyInterpretations.length===1?'':'s'}</span></div>
            <div className={attentionInterpretations.length?'attention':''}><strong>{attentionInterpretations.length}</strong><span>para conferir</span></div>
          </div>}

          <div className="review-list">{visibleInterpretations.map(({item:interpretation,index}) => <div className={interpretation.needsReview.includes('direction')?'interpretation-card needs-choice':'interpretation-card'} key={`${interpretation.description}-${index}`}>
            <div><strong>{interpretation.description}</strong><b>{money.format(interpretation.money.amountMinor / 100)}</b></div>
            <span>{interpretation.kind === 'commitment'
              ? (interpretation.recurring ? `Todo mês${interpretation.dueDay ? ` · dia ${interpretation.dueDay}` : ''}` : 'Conta para pagar')
              : interpretation.needsReview.includes('direction')
                ? 'Só falta dizer se entrou ou saiu'
                : interpretation.direction==='income'
                  ? 'Dinheiro que entrou'
                  : interpretation.direction==='transfer'
                    ? 'Só mudou de conta'
                    : 'Dinheiro que saiu'}
              {interpretation.occurredOn?` · ${new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(new Date(interpretation.occurredOn+'T12:00:00'))}`:''}
            </span>
            {interpretation.installment && <span>Parcela {interpretation.installment.current} de {interpretation.installment.total}</span>}
            {interpretation.needsReview.includes('direction')
              ? <div className="inline-direction-choice">
                  <button type="button" onClick={()=>chooseImportedDirection(index,'expense')}>Eu paguei</button>
                  <button type="button" onClick={()=>chooseImportedDirection(index,'income')}>Eu recebi</button>
                  <button type="button" onClick={()=>chooseImportedDirection(index,'transfer')}>Mudou de conta</button>
                </div>
              : interpretation.confidence !== 'high' && <em>Confira este item</em>}
          </div>)}</div>

          {hiddenReadyCount>0&&<button type="button" className="capture-show-all" onClick={()=>setShowAllReview(true)}>
            Ver {hiddenReadyCount} item{hiddenReadyCount===1?'':'s'} já organizado{hiddenReadyCount===1?'':'s'}
          </button>}
          {showAllReview&&interpretations.length>3&&<button type="button" className="capture-show-all" onClick={()=>setShowAllReview(false)}>
            Mostrar só o que importa
          </button>}

          {reviewCount > 0 && <p className="confidence-note">{unresolvedDirectionCount
            ? `Só ${unresolvedDirectionCount} item${unresolvedDirectionCount===1?' precisa':'s precisam'} de uma resposta rápida. O restante já está organizado.`
            : 'O que estava claro já foi organizado. Confira apenas os itens sinalizados.'}</p>}
          {upload && <div className="upload-status" role="status" aria-live="polite">
            <div><span>{upload.phase === 'uploading' ? 'Guardando original…' : 'Conferindo arquivo…'}</span><b>{upload.percent}%</b></div>
            <progress max="100" value={upload.percent}>{upload.percent}%</progress>
          </div>}
          {notice && <p className="notice-copy" role="status">{notice}</p>}
          {error && <p className="error-copy" role="alert">{error}</p>}

          <div className="sheet-actions">
            <button className="ghost-button" disabled={working} onClick={()=>{ setInterpretations([]); setUpload(null); }}>Corrigir</button>
            <button className="primary-button" disabled={working||unresolvedDirectionCount>0||(paymentMatches.length>0&&!paymentMatchDismissed)} onClick={confirm}>{saving
              ? (upload?.phase === 'verifying' ? 'Conferindo…' : 'Guardando…')
              : unresolvedDirectionCount
                ? `Falta ${unresolvedDirectionCount} confirmação${unresolvedDirectionCount===1?'':'ões'}`
                : paymentMatches.length>0&&!paymentMatchDismissed
                  ? 'Escolha a conta acima'
                  : 'Guardar'}</button>
          </div>
        </>}
      </section>
    </div>}
  </>;
}
