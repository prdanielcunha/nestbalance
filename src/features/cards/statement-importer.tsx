'use client';
import { useMemo, useState } from 'react';
import { ingestEvidence, type UploadProgress } from '@/src/lib/repositories/evidence';
import {
  commitCreditCardStatement,
  previewCreditCardStatement,
  type CreditCardStatementPreview
} from '@/src/lib/repositories/card-statements';
import type { HomeCreditCard } from '@/src/lib/repositories/home';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dateLabel=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});

function isoDate(year:number,monthIndex:number,day:number){
  const max=new Date(year,monthIndex+1,0).getDate();
  const safe=Math.min(day,max);
  return [year,String(monthIndex+1).padStart(2,'0'),String(safe).padStart(2,'0')].join('-');
}

function nextDueOn(card:HomeCreditCard){
  const now=new Date();
  let year=now.getFullYear();
  let month=now.getMonth();
  const today=now.getDate();
  if(today>card.dueDay){
    month+=1;
    if(month>11){month=0;year+=1;}
  }
  return isoDate(year,month,card.dueDay);
}

function displayDate(value:string|null){
  if(!value) return 'Data para conferir';
  return dateLabel.format(new Date(value+'T12:00:00'));
}

export function StatementImporter({
  householdId,
  card,
  onImported
}:{
  householdId:string;
  card:HomeCreditCard;
  onImported?:()=>void;
}){
  const [open,setOpen]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [dueOn,setDueOn]=useState(()=>nextDueOn(card));
  const [preview,setPreview]=useState<CreditCardStatementPreview|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [upload,setUpload]=useState<UploadProgress|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const selectedTotal=useMemo(()=>{
    if(!preview) return 0;
    return preview.items
      .filter(item=>selected.includes(item.key))
      .reduce((sum,item)=>sum+item.amountMinor,0);
  },[preview,selected]);

  function reset(close=true){
    setFile(null);
    setDueOn(nextDueOn(card));
    setPreview(null);
    setSelected([]);
    setUpload(null);
    setError('');
    setNotice('');
    if(close) setOpen(false);
  }

  async function readStatement(){
    if(!file){
      setError('Escolha a fatura em PDF, CSV, TXT ou imagem.');
      return;
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)){
      setError('Confira a data de vencimento da fatura.');
      return;
    }

    setWorking(true);
    setError('');
    setNotice('');
    setUpload(null);
    try{
      const evidence=await ingestEvidence(householdId,file,progress=>setUpload(progress));
      setUpload({phase:'verifying',percent:100});
      const result=await previewCreditCardStatement({
        householdId,
        cardId:card.id,
        evidenceId:evidence.canonicalEvidenceId,
        statementDueOn:dueOn
      });
      setPreview(result);
      setSelected(result.items.map(item=>item.key));
      setUpload(null);
      setNotice(
        result.sourceKind==='ai'
          ? 'Li o print com visão inteligente. Confira os itens antes de confirmar.'
          : 'Li a fatura diretamente do arquivo. Confira os itens antes de confirmar.'
      );
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='AI_NOT_CONFIGURED') setError('Este ambiente ainda não está com a leitura visual ativada. Use PDF, CSV ou TXT enquanto conectamos a visão.');
      else if(code==='STATEMENT_ITEMS_NOT_FOUND') setError('Não encontrei compras claras nessa fatura. O original ficou preservado no Cofre.');
      else if(code==='STATEMENT_TEXT_UNAVAILABLE') setError('Não consegui extrair texto dessa fatura. Tente um PDF com texto, CSV, TXT ou um print.');
      else setError('Não consegui preparar essa fatura agora. Nada foi lançado.');
      setUpload(null);
    }finally{
      setWorking(false);
    }
  }

  async function confirm(){
    if(!preview||!selected.length) return;
    setWorking(true);
    setError('');
    setNotice('');
    try{
      const result=await commitCreditCardStatement({
        householdId,
        previewId:preview.previewId,
        itemKeys:selected
      });
      const duplicateCopy=result.duplicates
        ? ` · ${result.duplicates} já existia${result.duplicates>1?'m':''}`
        : '';
      setNotice(`${result.created} compra${result.created===1?'':'s'} confirmada${result.created===1?'':'s'}${duplicateCopy}.`);
      onImported?.();
      setTimeout(()=>reset(true),500);
    }catch(err:any){
      const code=String(err?.message||'');
      if(code==='STATEMENT_PREVIEW_EXPIRED') setError('A revisão expirou por segurança. Leia a fatura novamente.');
      else setError('Não consegui confirmar essa fatura. Nenhuma compra foi parcialmente gravada.');
    }finally{
      setWorking(false);
    }
  }

  function toggle(key:string){
    setSelected(current=>current.includes(key)?current.filter(value=>value!==key):[...current,key]);
  }

  return <>
    <button type="button" className="card-import-button" onClick={()=>setOpen(true)}>Importar fatura</button>

    {open&&<div className="sheet-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&!working&&reset(true)}>
      <section className="capture-sheet statement-sheet" role="dialog" aria-modal="true" aria-label={'Importar fatura de '+card.name}>
        <div className="sheet-handle"/>
        <div className="eyebrow">Fatura · {card.name}</div>

        {!preview?<>
          <h2>Jogue a fatura aqui.</h2>
          <p>PDF, CSV, TXT ou print. O NestBalance separa as compras, reconhece parcelas e mantém o arquivo original no Cofre.</p>

          <label className="field-label" htmlFor={'statement-due-'+card.id}>Vencimento desta fatura</label>
          <input
            id={'statement-due-'+card.id}
            className="premium-input"
            type="date"
            value={dueOn}
            disabled={working}
            onChange={event=>setDueOn(event.target.value)}
          />

          <label className="statement-drop">
            <input
              type="file"
              accept="image/*,.pdf,text/plain,text/csv"
              disabled={working}
              onChange={event=>{
                setFile(event.target.files?.[0]||null);
                setError('');
                setNotice('');
              }}
            />
            <span>{file?file.name:'Escolher fatura'}</span>
            <small>O pagamento da fatura não será contado como um novo gasto. As compras são o gasto real.</small>
          </label>

          {upload&&<div className="upload-status" role="status">
            <div><span>{upload.phase==='uploading'?'Guardando original…':'Conferindo arquivo…'}</span><b>{upload.percent}%</b></div>
            <progress max="100" value={upload.percent}>{upload.percent}%</progress>
          </div>}

          {notice&&<p className="notice-copy" role="status">{notice}</p>}
          {error&&<p className="error-copy" role="alert">{error}</p>}

          <div className="sheet-actions">
            <button className="ghost-button" disabled={working} onClick={()=>reset(true)}>Cancelar</button>
            <button className="primary-button" disabled={working||!file} onClick={readStatement}>{working?'Lendo…':'Ler fatura'}</button>
          </div>
        </>:<>
          <div className="statement-review-heading">
            <div>
              <h2>{preview.items.length} compra{preview.items.length===1?'':'s'} encontrada{preview.items.length===1?'':'s'}.</h2>
              <p>{money.format(selectedTotal/100)} selecionados para esta fatura.</p>
            </div>
            <button type="button" className="text-button" disabled={working} onClick={()=>{setPreview(null);setSelected([]);setNotice('');}}>Trocar arquivo</button>
          </div>

          <div className="statement-summary-strip">
            <div><span>Fatura lida</span><strong>{money.format(preview.currentInvoiceMinor/100)}</strong></div>
            <div><span>Vencimento</span><strong>{displayDate(preview.statementDueOn)}</strong></div>
            <div><span>Leitura</span><strong>{preview.sourceKind==='ai'?'Visual + IA':'Direta do arquivo'}</strong></div>
          </div>

          {preview.warnings.includes('items_need_review')&&<p className="confidence-note">Alguns itens precisam de atenção. Nada ambíguo é confirmado sozinho.</p>}
          {preview.truncated&&<p className="confidence-note">O arquivo era grande e foi lido parcialmente. Confira se todas as compras importantes aparecem.</p>}

          <div className="statement-items">
            {preview.items.map(item=>{
              const checked=selected.includes(item.key);
              return <label key={item.key} className={checked?'statement-item selected':'statement-item'}>
                <input type="checkbox" checked={checked} onChange={()=>toggle(item.key)} disabled={working}/>
                <div className="statement-item-copy">
                  <strong>{item.description}</strong>
                  <span>
                    {displayDate(item.observedOn)}
                    {item.installment?' · '+item.installment.current+'/'+item.installment.total:''}
                    {item.needsReview.length?' · conferir':''}
                  </span>
                </div>
                <b>{money.format(item.amountMinor/100)}</b>
              </label>;
            })}
          </div>

          {preview.projectedMonths.length>1&&<div className="statement-projection">
            <span>Impacto das parcelas já visíveis</span>
            <div>
              {preview.projectedMonths.slice(0,6).map(month=><div key={month.dueOn}>
                <small>{new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit'}).format(new Date(month.dueOn+'T12:00:00'))}</small>
                <strong>{money.format(month.totalMinor/100)}</strong>
              </div>)}
            </div>
          </div>}

          {notice&&<p className="notice-copy" role="status">{notice}</p>}
          {error&&<p className="error-copy" role="alert">{error}</p>}

          <div className="sheet-actions">
            <button className="ghost-button" disabled={working} onClick={()=>reset(true)}>Cancelar</button>
            <button className="primary-button" disabled={working||!selected.length} onClick={confirm}>
              {working?'Confirmando…':`Confirmar ${selected.length} compra${selected.length===1?'':'s'}`}
            </button>
          </div>
        </>}
      </section>
    </div>}
  </>;
}
