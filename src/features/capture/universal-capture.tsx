'use client';
import { useEffect, useState } from 'react';
import { parseFinancialList } from '@/src/core/text-parser';
import type { FinancialInterpretation } from '@/src/core/types';
import { commitInterpretation } from '@/src/lib/repositories/finance';
import type { UploadProgress } from '@/src/lib/repositories/evidence';
import { messages } from '@/src/i18n/messages';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function UniversalCapture({ householdId, uid, onCommitted }: { householdId: string; uid: string; onCommitted?: () => void }) {
  const t = messages['pt-BR'];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [interpretations, setInterpretations] = useState<FinancialInterpretation[]>([]);
  const [saving, setSaving] = useState(false);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving]);

  function reset() {
    if (saving) return;
    setOpen(false); setText(''); setFile(null); setInterpretations([]); setUpload(null); setError(''); setNotice('');
  }

  function interpret() {
    setError(''); setNotice('');
    try { setInterpretations(parseFinancialList(text)); }
    catch { setError('Diga pelo menos o que aconteceu e, se souber, o valor.'); }
  }

  async function confirm() {
    if (!interpretations.length) return;
    setSaving(true); setUpload(null); setError(''); setNotice('');
    try {
      let created = 0; let duplicates = 0;
      for (let i = 0; i < interpretations.length; i++) {
        const result = await commitInterpretation({
          householdId,
          uid,
          interpretation: interpretations[i],
          file: i === 0 ? file : null,
          onUploadProgress: progress => setUpload(progress)
        });
        if (result.status === 'duplicate') duplicates++; else created++;
      }
      if (duplicates && !created) {
        setNotice('Isso já parece estar registrado. Não criamos uma cópia.');
        setSaving(false);
        setUpload(null);
        return;
      }
      setOpen(false); setText(''); setFile(null); setInterpretations([]); setUpload(null); onCommitted?.();
    } catch {
      setError('Não conseguimos salvar isso agora. Nada foi marcado como concluído.');
    } finally { setSaving(false); }
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
          <div className="eyebrow">Entrada universal</div><h2>{t.captureTitle}</h2><p>{t.captureHint}</p>
          <label className="sr-only" htmlFor="universal-capture-text">Conte o que aconteceu</label>
          <textarea id="universal-capture-text" autoFocus value={text} onChange={e=>setText(e.target.value)} placeholder={'Ex.: Internet 119,90 dia 10 todo mês\nCarro 1286 dia 18\nEscola 780 dia 25'} />
          <label className="file-drop"><input type="file" accept="image/*,.pdf,text/csv,audio/*" onChange={e=>setFile(e.target.files?.[0] ?? null)} />{file ? file.name : 'Imagem, PDF, CSV ou áudio'}</label>
          {error && <p className="error-copy" role="alert">{error}</p>}
          <div className="sheet-actions"><button className="ghost-button" onClick={reset}>{t.cancel}</button><button className="primary-button" disabled={!text.trim()} onClick={interpret}>Entender</button></div>
        </> : <>
          <div className="sheet-handle" /><div className="eyebrow">{t.understood}</div><h2>{interpretations.length === 1 ? interpretations[0].description : `Encontramos ${interpretations.length} itens`}</h2>

          <div className="evidence-stack" aria-label="Como o NestBalance entendeu">
            <div><span>ORIGINAL</span><strong>{file ? file.name : 'Texto enviado'}</strong><small>{file ? 'O arquivo será preservado sem alterações.' : text.length > 80 ? `${text.slice(0, 80)}…` : text}</small></div>
            <div><span>ENTENDEMOS</span><strong>{interpretations.length === 1 ? `${interpretations[0].description} · ${money.format(interpretations[0].money.amountMinor / 100)}` : `${interpretations.length} itens encontrados`}</strong><small>{reviewCount ? `${reviewCount} precisa${reviewCount > 1 ? 'm' : ''} de conferência.` : 'Os dados principais estão claros.'}</small></div>
            <div><span>ORGANIZAMOS COMO</span><strong>{organizedLabel}</strong><small>{file ? 'Documento e registro ficarão ligados entre si.' : 'Você poderá corrigir isso depois sem perder o original.'}</small></div>
          </div>

          <div className="review-list">{interpretations.map((interpretation, index) => <div className="interpretation-card" key={`${interpretation.description}-${index}`}>
            <div><strong>{interpretation.description}</strong><b>{money.format(interpretation.money.amountMinor / 100)}</b></div>
            <span>{interpretation.kind === 'commitment' ? (interpretation.recurring ? `Todo mês${interpretation.dueDay ? ` · dia ${interpretation.dueDay}` : ''}` : 'Conta a pagar') : 'Movimento'}</span>
            {interpretation.installment && <span>Parcela {interpretation.installment.current} de {interpretation.installment.total}</span>}
            {interpretation.confidence !== 'high' && <em>Confira este item</em>}
          </div>)}</div>

          {reviewCount > 0 && <p className="confidence-note">{reviewCount === 1 ? 'Só 1 item precisa de uma conferida.' : `${reviewCount} itens precisam de uma conferida.`}</p>}
          {upload && <div className="upload-status" role="status" aria-live="polite">
            <div><span>{upload.phase === 'uploading' ? 'Guardando original…' : 'Conferindo arquivo…'}</span><b>{upload.percent}%</b></div>
            <progress max="100" value={upload.percent}>{upload.percent}%</progress>
          </div>}
          {notice && <p className="notice-copy" role="status">{notice}</p>}
          {error && <p className="error-copy" role="alert">{error}</p>}
          <div className="sheet-actions"><button className="ghost-button" disabled={saving} onClick={()=>{ setInterpretations([]); setUpload(null); }}>{t.cancel}</button><button className="primary-button" disabled={saving} onClick={confirm}>{saving ? (upload?.phase === 'verifying' ? 'Conferindo…' : 'Guardando…') : t.confirm}</button></div>
        </>}
      </section>
    </div>}
  </>;
}
