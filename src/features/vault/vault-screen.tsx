'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getVaultDetail, getVaultPreview, listVault, type VaultDetail, type VaultItem } from '@/src/lib/repositories/vault';

const bytes = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });

function sizeLabel(value:number) {
  if(value<1024) return `${value} B`;
  if(value<1024*1024) return `${bytes.format(value/1024)} KB`;
  return `${bytes.format(value/(1024*1024))} MB`;
}

function typeLabel(mime:string) {
  if(mime==='application/pdf') return 'PDF';
  if(mime.startsWith('image/')) return 'Imagem';
  if(mime.startsWith('audio/')) return 'Áudio';
  if(mime==='text/csv') return 'CSV';
  if(mime.startsWith('text/')) return 'Texto';
  return 'Documento';
}

function understandingLabel(state:string) {
  if(state==='ai_extracted') return 'Entendido com IA';
  if(state==='extracted') return 'Conteúdo entendido';
  if(state==='needs_ai') return 'Aguardando leitura inteligente';
  if(state==='unavailable') return 'Precisa de revisão';
  return 'Guardado';
}

export function VaultScreen({householdId}:{householdId:string}) {
  const [items,setItems]=useState<VaultItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<VaultItem|null>(null);
  const [detail,setDetail]=useState<VaultDetail|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [previewUrl,setPreviewUrl]=useState<string|null>(null);
  const [previewLoading,setPreviewLoading]=useState(false);

  async function load() {
    setLoading(true); setError('');
    try { setItems((await listVault(householdId)).items); }
    catch { setError('Não conseguimos abrir seu Cofre agora.'); }
    finally { setLoading(false); }
  }

  useEffect(()=>{ void load(); },[householdId]);

  useEffect(()=>()=>{ if(previewUrl) URL.revokeObjectURL(previewUrl); },[previewUrl]);

  async function openItem(item:VaultItem) {
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); setSelected(item); setDetail(null); setDetailLoading(true);
    try { setDetail(await getVaultDetail(householdId,item.evidenceId)); }
    catch { setError('Não conseguimos abrir os detalhes desse documento.'); }
    finally { setDetailLoading(false); }
  }

  async function preview() {
    if(!selected) return;
    setPreviewLoading(true);
    try {
      const blob=await getVaultPreview(householdId,selected.evidenceId);
      if(previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError('Não conseguimos abrir o original agora.');
    } finally { setPreviewLoading(false); }
  }

  const summary=useMemo(()=>{
    const signals=detail?.understood?.signals?.candidates||[];
    const values=signals.filter(x=>x.kind==='money'&&typeof x.amountMinor==='number');
    const dates=signals.filter(x=>x.kind==='date');
    const installments=signals.filter(x=>x.kind==='installment');
    const ai=detail?.understood?.extraction||null;
    const aiAmount=ai?.amountMinor&&ai.amountMinor>0?ai.amountMinor:null;
    return {values,dates,installments,ai,aiAmount,transcript:detail?.understood?.transcriptPreview||null};
  },[detail]);

  return <main className="app-shell vault-shell">
    <header className="topbar">
      <div><div className="eyebrow">NestBalance</div><span className="topbar-subtitle">Cofre</span></div>
      <Link className="text-link" href="/">Voltar</Link>
    </header>

    <section className="vault-hero">
      <span>Seus documentos financeiros</span>
      <h1>Guardados. Encontráveis. Ligados ao que aconteceu.</h1>
      <p>Comprovantes, faturas e arquivos originais ficam preservados. O NestBalance separa o que você enviou do que ele entendeu.</p>
    </section>

    {error && <p className="error-copy" role="alert">{error}</p>}

    {loading ? <div className="vault-list" aria-label="Carregando Cofre">{[0,1,2].map(i=><div className="vault-row skeleton-line" key={i} />)}</div>
    : items.length===0 ? <section className="empty-state"><h3>Seu Cofre começa com o primeiro envio.</h3><p>Quando você enviar um comprovante, fatura ou documento pela Entrada universal, o original aparecerá aqui.</p></section>
    : <section className="vault-list" aria-label="Documentos guardados">
      {items.map(item=><button className="vault-row" key={item.evidenceId} onClick={()=>openItem(item)}>
        <div className="vault-file-mark">{typeLabel(item.mimeType).slice(0,1)}</div>
        <div className="vault-row-copy">
          <strong>{item.originalName}</strong>
          <span>{typeLabel(item.mimeType)} · {sizeLabel(item.size)} · {understandingLabel(item.extractionState)}</span>
        </div>
        <span className="vault-row-date">{item.createdAtMs ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(item.createdAtMs) : ''}</span>
      </button>)}
    </section>}

    {selected && <div className="sheet-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!previewLoading){setSelected(null);setDetail(null);if(previewUrl)URL.revokeObjectURL(previewUrl);setPreviewUrl(null);}}}>
      <section className="capture-sheet vault-detail" role="dialog" aria-modal="true" aria-label={selected.originalName}>
        <div className="sheet-handle" />
        <div className="eyebrow">ORIGINAL</div>
        <h2>{selected.originalName}</h2>
        <p>{typeLabel(selected.mimeType)} · {sizeLabel(selected.size)}</p>

        {detailLoading ? <div className="vault-detail-skeleton" /> : detail && <>
          <div className="evidence-stack">
            <div><span>ORIGINAL</span><strong>Preservado</strong><small>O arquivo que você enviou permanece separado da interpretação.</small></div>
            <div><span>ENTENDEMOS</span><strong>{understandingLabel(detail.understood?.state||selected.extractionState)}</strong><small>{detail.understood?.aiUsed ? 'Houve análise por IA.' : detail.understood ? 'Análise determinística; sem IA.' : 'Ainda não analisado.'}</small></div>
            <div><span>ENCONTRAMOS</span><strong>{summary.ai?.description || (summary.values.length+summary.dates.length+summary.installments.length ? `${summary.values.length+summary.dates.length+summary.installments.length} sinais` : 'Nenhum dado confirmado')}</strong><small>São candidatos; não substituem sua confirmação.</small></div>
          </div>

          {summary.aiAmount && <div className="vault-signal-block"><span>Valor principal entendido</span><div><b>{money.format(summary.aiAmount/100)}</b></div></div>}
          {!summary.aiAmount && summary.values.length>0 && <div className="vault-signal-block"><span>Valores encontrados</span><div>{summary.values.slice(0,6).map((x,i)=><b key={`${x.start}-${i}`}>{money.format((x.amountMinor||0)/100)}</b>)}</div></div>}
          {summary.installments.length>0 && <div className="vault-signal-block"><span>Parcelas possíveis</span><div>{summary.installments.slice(0,6).map((x,i)=><b key={`${x.start}-${i}`}>{x.normalized}</b>)}</div></div>}
          {summary.transcript && <div className="vault-transcript"><span>Transcrição</span><p>{summary.transcript}</p></div>}

          {!previewUrl ? <button className="primary-button vault-preview-button" disabled={previewLoading} onClick={preview}>{previewLoading?'Conferindo original…':'Ver original'}</button>
          : <div className="vault-preview">
              {selected.mimeType.startsWith('image/') && <img src={previewUrl} alt={selected.originalName} />}
              {selected.mimeType==='application/pdf' && <iframe src={previewUrl} title={selected.originalName} />}
              {selected.mimeType.startsWith('audio/') && <audio controls src={previewUrl} />}
              {selected.mimeType.startsWith('text/') && <iframe src={previewUrl} title={selected.originalName} />}
            </div>}
        </>}
        <div className="sheet-actions"><button className="ghost-button" disabled={previewLoading} onClick={()=>{setSelected(null);setDetail(null);if(previewUrl)URL.revokeObjectURL(previewUrl);setPreviewUrl(null);}}>Fechar</button></div>
      </section>
    </div>}
  </main>;
}
