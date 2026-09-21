'use client';
import { useEffect, useState } from 'react';
import { parseFinancialList } from '@/src/core/text-parser';
import type { FinancialInterpretation } from '@/src/core/types';
import { sourceTextForChosenDocumentAmount, suggestCaptureFromDocument } from '@/src/core/document-suggestion';
import {
  aiAmountChoices,
  aiDirectionNeedsConfirmation,
  sourceTextFromAiExtraction,
  type AiFinancialDirection,
  type AiFinancialExtraction
} from '@/src/core/ai-financial';
import { commitInterpretation } from '@/src/lib/repositories/finance';
import {
  analyzeEvidenceAi,
  analyzeEvidenceText,
  ingestEvidence,
  type AiEvidenceAnalysis,
  type EvidenceTextAnalysis,
  type UploadProgress
} from '@/src/lib/repositories/evidence';
import { messages } from '@/src/i18n/messages';

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

  const working = saving || analyzing;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !working) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, working]);

  function clearAll() {
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

  function applySourceText(sourceText: string, documentDerived = false) {
    const parsed = parseFinancialList(sourceText);
    setText(sourceText);
    setInterpretations(documentDerived ? markDocumentDerived(parsed) : parsed);
    setAmountChoices([]);
    setDirectionChoice(false);
    setPendingAi(null);
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

  async function interpret() {
    setError('');
    setNotice('');
    setAmountChoices([]);
    setDirectionChoice(false);

    if (text.trim()) {
      try { applySourceText(text); }
      catch { setError('Diga pelo menos o que aconteceu e, se souber, o valor.'); }
      return;
    }

    if (!file) {
      setError('Escreva o que aconteceu ou envie um documento.');
      return;
    }

    setAnalyzing(true);
    setUpload(null);
    try {
      let evidenceId = preparedEvidenceId;
      if (!evidenceId) {
        const evidence = await ingestEvidence(householdId, file, progress => setUpload(progress));
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
          if(ai.kind==='audio'){
            const transcript=ai.transcript?.trim()||'';
            if(!transcript||!ai.parsedInterpretations?.length){
              setNotice('Áudio transcrito, mas não encontrei uma movimentação clara. Você pode ajustar o texto acima.');
              if(transcript) setText(transcript);
              return;
            }
            setText(transcript);
            setInterpretations(markDocumentDerived(ai.parsedInterpretations));
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

      const suggestion = suggestCaptureFromDocument(file.name, result.signals);
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

  async function confirm() {
    if (!interpretations.length) return;
    setSaving(true);
    setUpload(null);
    setError('');
    setNotice('');
    try {
      let created = 0;
      let duplicates = 0;
      for (let i = 0; i < interpretations.length; i++) {
        const result = await commitInterpretation({
          householdId,
          uid,
          interpretation: interpretations[i],
          evidenceId: i === 0 ? preparedEvidenceId : null,
          file: i === 0 && !preparedEvidenceId ? file : null,
          onUploadProgress: progress => setUpload(progress)
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

  const reviewCount = interpretations.filter(x => x.confidence !== 'high').length;
  const organizedLabel = interpretations.length === 1
    ? (interpretations[0].kind === 'commitment'
        ? 'Conta a pagar'
        : interpretations[0].direction === 'income'
          ? 'Entrada'
          : interpretations[0].direction === 'transfer'
            ? 'Transferência'
            : 'Saída')
    : `${interpretations.length} itens financeiros`;

  return <>
    {showTrigger&&<button className="capture-fab" onClick={() => setOpen(true)} aria-label={t.add}>＋ <span>{t.add}</span></button>}
    {open && <div className="sheet-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && reset()}>
      <section className="capture-sheet" role="dialog" aria-modal="true" aria-label={t.captureTitle}>
        {!interpretations.length ? <>
          <div className="sheet-handle" />
          <div className="eyebrow">Entrada universal</div>
          <h2>{t.captureTitle}</h2>
          <p>{t.captureHint}</p>

          <label className="sr-only" htmlFor="universal-capture-text">Conte o que aconteceu</label>
          <textarea
            id="universal-capture-text"
            autoFocus
            value={text}
            disabled={working}
            onChange={e=>setText(e.target.value)}
            placeholder={'Ex.: Internet 119,90 dia 10 todo mês\nCarro 1286 dia 18\nEscola 780 dia 25'}
          />

          <label className="file-drop">
            <input
              type="file"
              accept="image/*,.pdf,text/plain,text/csv,audio/*"
              disabled={working}
              onChange={e=>{
                setFile(e.target.files?.[0] ?? null);
                setPreparedEvidenceId(null);
                setAnalysis(null);
                setAiAnalysis(null);
                setPendingAi(null);
                setAmountChoices([]);
                setDirectionChoice(false);
                setNotice('');
                setError('');
              }}
            />
            {file ? file.name : 'Imagem, PDF, TXT, CSV ou áudio'}
          </label>

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
              <button type="button" onClick={()=>chooseDirection('expense')}>Saiu</button>
              <button type="button" onClick={()=>chooseDirection('income')}>Entrou</button>
              <button type="button" onClick={()=>chooseDirection('transfer')}>Entre minhas contas</button>
            </div>
            <small>Transferências entre suas contas não entram como gasto nem como renda.</small>
          </div>}

          {analysis?.state === 'extracted' && !aiAnalysis && <p className="native-analysis-note">Texto lido diretamente do documento · sem IA</p>}
          {aiAnalysis && <p className="native-analysis-note">{aiAnalysis.kind==='audio'?'Áudio transcrito com IA':'Imagem lida com IA'} · confirmação humana antes de guardar</p>}
          {notice && <p className="notice-copy" role="status">{notice}</p>}
          {error && <p className="error-copy" role="alert">{error}</p>}

          <div className="sheet-actions">
            <button className="ghost-button" disabled={working} onClick={reset}>{t.cancel}</button>
            <button className="primary-button" disabled={working || (!text.trim() && !file)} onClick={interpret}>
              {analyzing ? 'Entendendo…' : 'Entender'}
            </button>
          </div>
        </> : <>
          <div className="sheet-handle" />
          <div className="eyebrow">{t.understood}</div>
          <h2>{interpretations.length === 1 ? interpretations[0].description : `Encontramos ${interpretations.length} itens`}</h2>

          <div className="evidence-stack" aria-label="Como o NestBalance entendeu">
            <div>
              <span>ORIGINAL</span>
              <strong>{file ? file.name : 'Texto enviado'}</strong>
              <small>{file ? (preparedEvidenceId ? 'Original já guardado e preservado.' : 'O arquivo será preservado sem alterações.') : text.length > 80 ? `${text.slice(0, 80)}…` : text}</small>
            </div>
            <div>
              <span>ENTENDEMOS</span>
              <strong>{interpretations.length === 1 ? `${interpretations[0].description} · ${money.format(interpretations[0].money.amountMinor / 100)}` : `${interpretations.length} itens encontrados`}</strong>
              <small>{aiAnalysis ? 'Interpretação por IA; confirme antes de guardar.' : analysis?.state === 'extracted' ? 'Leitura nativa do documento; sem IA.' : reviewCount ? `${reviewCount} precisa${reviewCount > 1 ? 'm' : ''} de conferência.` : 'Os dados principais estão claros.'}</small>
            </div>
            <div>
              <span>ORGANIZAMOS COMO</span>
              <strong>{organizedLabel}</strong>
              <small>{file ? 'Documento e registro ficarão ligados entre si.' : 'Você poderá corrigir isso depois sem perder o original.'}</small>
            </div>
          </div>

          <div className="review-list">{interpretations.map((interpretation, index) => <div className="interpretation-card" key={`${interpretation.description}-${index}`}>
            <div><strong>{interpretation.description}</strong><b>{money.format(interpretation.money.amountMinor / 100)}</b></div>
            <span>{interpretation.kind === 'commitment'
              ? (interpretation.recurring ? `Todo mês${interpretation.dueDay ? ` · dia ${interpretation.dueDay}` : ''}` : 'Conta a pagar')
              : interpretation.direction==='transfer'?'Transferência':'Movimento'}</span>
            {interpretation.installment && <span>Parcela {interpretation.installment.current} de {interpretation.installment.total}</span>}
            {interpretation.confidence !== 'high' && <em>Confira este item</em>}
          </div>)}</div>

          {reviewCount > 0 && <p className="confidence-note">Revise o que veio do documento. O NestBalance não confirma sozinho quando existe dúvida.</p>}
          {upload && <div className="upload-status" role="status" aria-live="polite">
            <div><span>{upload.phase === 'uploading' ? 'Guardando original…' : 'Conferindo arquivo…'}</span><b>{upload.percent}%</b></div>
            <progress max="100" value={upload.percent}>{upload.percent}%</progress>
          </div>}
          {notice && <p className="notice-copy" role="status">{notice}</p>}
          {error && <p className="error-copy" role="alert">{error}</p>}

          <div className="sheet-actions">
            <button className="ghost-button" disabled={working} onClick={()=>{ setInterpretations([]); setUpload(null); }}>{t.cancel}</button>
            <button className="primary-button" disabled={working} onClick={confirm}>{saving ? (upload?.phase === 'verifying' ? 'Conferindo…' : 'Guardando…') : t.confirm}</button>
          </div>
        </>}
      </section>
    </div>}
  </>;
}
