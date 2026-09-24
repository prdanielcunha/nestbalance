'use client';

import { CaptureProgress } from '@/src/features/capture/capture-progress';
import type { UniversalCaptureController } from '@/src/lib/capture/use-universal-capture-controller';

export function CaptureReviewView({c}:{c:UniversalCaptureController}){
  const {
    t,l,formatMoney,formatDate,working,file,preparedEvidenceId,text,analysis,aiAnalysis,geminiUsed,localOcrText,reprocessLocalAs,
    captureStage,captureStageLabels,interpretations,screenSnapshot,setScreenSnapshot,screenResourceCount,totalOrganizedCount,reviewCount,
    organizedLabel,readEditedMoney,moneyInputValue,matchingPayments,paymentMatches,paymentMatchDismissed,payingMatchId,
    confirmMatchedPayment,setPaymentMatchDismissed,readyInterpretations,attentionInterpretations,visibleInterpretations,
    editInterpretation,reportCaptureCorrection,chooseImportedDirection,hiddenReadyCount,setShowAllReview,showAllReview,
    unresolvedDirectionCount,upload,notice,error,setInterpretations,setUpload,missingScreenInstitution,confirm,saving
  }=c;
  return <>
          <div className="sheet-handle" />
          <div className="eyebrow">{t.understood}</div>
          <CaptureProgress stage={captureStage} labels={captureStageLabels}/>
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

          <div className="review-list">{visibleInterpretations.map(({item:interpretation,index}) => <div className={interpretation.needsReview.includes('direction')?'interpretation-card needs-choice':'interpretation-card'} key={`capture-review-${index}`}>
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
            <details className="inline-capture-edit">
              <summary>{l('Corrigir este item','Correct this item','Corregir este elemento')}</summary>
              <div className="inline-capture-edit-grid">
                <label>
                  <span>{l('Descrição','Description','Descripción')}</span>
                  <input
                    value={interpretation.description}
                    maxLength={160}
                    onBlur={()=>reportCaptureCorrection('label_field')}
                    onChange={event=>editInterpretation(index,current=>({
                      ...current,
                      description:event.target.value,
                      confidence:current.needsReview.includes('direction')?'medium':'high',
                      needsReview:current.needsReview.filter(reason=>reason!=='document_review')
                    }))}
                  />
                </label>
                <label>
                  <span>{l('Valor','Amount','Valor')}</span>
                  <input
                    key={`capture-amount-${index}-${interpretation.money.amountMinor}`}
                    inputMode="decimal"
                    defaultValue={moneyInputValue(interpretation.money.amountMinor)}
                    onBlur={event=>{
                      const amountMinor=readEditedMoney(event.currentTarget.value);
                      if(amountMinor===null) return;
                      reportCaptureCorrection('value_field');
                      editInterpretation(index,current=>({
                        ...current,
                        money:{...current.money,amountMinor},
                        confidence:current.needsReview.includes('direction')?'medium':'high',
                        needsReview:current.needsReview.filter(reason=>!['amount','amount_positive','document_review'].includes(reason))
                      }));
                    }}
                  />
                </label>
                {interpretation.kind==='commitment'&&<label>
                  <span>{l('Dia do vencimento','Due day','Día de vencimiento')}</span>
                  <input
                    inputMode="numeric"
                    value={interpretation.dueDay??''}
                    placeholder="—"
                    onBlur={()=>reportCaptureCorrection('due_day')}
                    onChange={event=>{
                      const raw=event.target.value;
                      const parsed=Number(raw);
                      const dueDay=raw===''?undefined:Number.isInteger(parsed)&&parsed>=1&&parsed<=31?parsed:interpretation.dueDay;
                      editInterpretation(index,current=>({...current,dueDay}));
                    }}
                  />
                </label>}
              </div>
              <small>{l(
                'A correção que você confirmar aqui prevalece sobre o parser. Nada é alterado silenciosamente depois.',
                'The correction you confirm here overrides the parser. Nothing is silently changed afterward.',
                'La corrección que confirmes aquí prevalece sobre el parser. Nada se cambia silenciosamente después.'
              )}</small>
            </details>
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
                  : totalOrganizedCount>1
                    ? l(`Aprovar e guardar ${totalOrganizedCount}`,`Approve and save ${totalOrganizedCount}`,`Aprobar y guardar ${totalOrganizedCount}`)
                    : l('Guardar','Save','Guardar')}</button>
          </div>
        </>;
}
