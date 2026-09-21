'use client';
import { useEffect, useState } from 'react';
import { parseFinancialList } from '@/src/core/text-parser';
import type { FinancialInterpretation } from '@/src/core/types';
import { sourceTextForChosenDocumentAmount, suggestCaptureFromDocument } from '@/src/core/document-suggestion';
import { commitInterpretation } from '@/src/lib/repositories/finance';
import {
  analyzeEvidenceText,
  ingestEvidence,
  type EvidenceTextAnalysis,
  type UploadProgress
} from '@/src/lib/repositories/evidence';
import { messages } from '@/src/i18n/messages';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function markDocumentDerived(items: FinancialInterpretation[]) {
  return items.map(item => ({
    ...item,
    confidence: 'medium' as const,
    needsReview: [...new Set([...item.needsReview, 'document_review'])],
    fieldConfidence: { ...item.fieldConfidence, description: Math.min(item.fieldConfidence.description ?? 0.5, 0.65) }
  }));
}

export function UniversalCapture({ householdId, uid, onCommitted }: { householdId: string; uid: string; onCommitted?: () => void }) {
  const t = messages['pt-BR'];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preparedEvidenceId, setPreparedEvidenceId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<EvidenceTextAnalysis | null>(null);
  const [amountChoices, setAmountChoices] = useState<number[]>([]);
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
    setText('');
    setFile(null);
    setPreparedEvidenceId(null);
    setAnalysis(null);
    setAmountChoices([]);
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
  }

  async function interpret() {
    setError('');
    setNotice('');
    setAmountChoices([]);

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
        setNotice(
          result.reason === 'audio_input'
            ? 'Comprovante guardado. Este áudio precisa de transcrição para eu entender o conteúdo; ainda não criei nenhum lançamento.'
            : 'Comprovante guardado. Esta imagem precisa de leitura visual para eu entender o conteúdo; ainda não criei nenhum lançamento.'
        );
        return;
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
    if (!file || !analysis || analysis.state !== 'extracted') return;
    try {
      applySourceText(sourceTextForChosenDocumentAmount(file.name, amountMinor, analysis.signals), true);
      setNotice('Usei o valor que você escolheu. Confira o restante antes de guardar.');
    } catch {
      setError('Não consegui preparar essa revisão.');
    }
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
    ? (interpretations[0].kind === 'commitment' ? 'Conta a pagar' : interpretations[0].direction === 'income' ? 'Entrada' : 'Saída')
    : `${interpretations.length} itens financeiros`;

  return <>
    <button className="capture-fab" onClick={() => setOpen(true)} aria-label={t.add}>＋ <span>{t.add}</span></button>
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
                setAmountChoices([]);
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

          {analyzing && !upload && <p className="confidence-note" role="status">Entendendo o documento…</p>}

          {amountChoices.length > 0 && <div className="amount-choice-panel">
            <span>Qual valor devo usar?</span>
            <div>{amountChoices.map(value => <button key={value} type="button" onClick={()=>chooseAmount(value)}>{money.format(value/100)}</button>)}</div>
            <small>Nenhum valor é escolhido automaticamente quando o documento é ambíguo.</small>
          </div>}

          {analysis?.state === 'extracted' && <p className="native-analysis-note">Texto lido diretamente do documento · sem IA</p>}
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
              <small>{analysis?.state === 'extracted' ? 'Leitura nativa do documento; sem IA.' : reviewCount ? `${reviewCount} precisa${reviewCount > 1 ? 'm' : ''} de conferência.` : 'Os dados principais estão claros.'}</small>
            </div>
            <div>
              <span>ORGANIZAMOS COMO</span>
              <strong>{organizedLabel}</strong>
              <small>{file ? 'Documento e registro ficarão ligados entre si.' : 'Você poderá corrigir isso depois sem perder o original.'}</small>
            </div>
          </div>

          <div className="review-list">{interpretations.map((interpretation, index) => <div className="interpretation-card" key={`${interpretation.description}-${index}`}>
            <div><strong>{interpretation.description}</strong><b>{money.format(interpretation.money.amountMinor / 100)}</b></div>
            <span>{interpretation.kind === 'commitment' ? (interpretation.recurring ? `Todo mês${interpretation.dueDay ? ` · dia ${interpretation.dueDay}` : ''}` : 'Conta a pagar') : 'Movimento'}</span>
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
