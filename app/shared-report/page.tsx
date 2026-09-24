'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { viewSharedMonthlyReport } from '@/src/lib/repositories/reports';

export default function SharedReportPage(){
  const [report,setReport]=useState<null|{periodKey:string;summary:Record<string,number|string>;expiresAtMs:number}>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    const token=new URLSearchParams(window.location.search).get('token')||'';
    if(!token){setError('Link inválido.');return;}
    void viewSharedMonthlyReport(token).then(result=>setReport(result.report)).catch(err=>{
      const code=String(err?.message||'');
      setError(code==='SHARED_REPORT_EXPIRED'?'Este relatório expirou.':'Este relatório não está disponível.');
    });
  },[]);

  const money=(minor:unknown)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(minor)||0)/100);

  return <main className="public-info-shell shared-report-shell">
    <header><Link href="/">NestBalance</Link><span>Resumo compartilhado</span></header>
    <section className="public-info-card">
      {error?<><span>RELATÓRIO</span><h1>Link indisponível</h1><p>{error}</p></>:!report?<><span>RELATÓRIO</span><h1>Carregando…</h1></>:<>
        <span>RESUMO AGREGADO · {report.periodKey}</span>
        <h1>Um retrato do mês, sem expor os lançamentos.</h1>
        <p>Este link mostra somente totais compartilhados. Não inclui descrições, documentos, contas pessoais ou a lista de movimentações.</p>
        <div className="shared-report-grid">
          <div><span>Entradas conhecidas</span><strong>{money(report.summary.incomeMinor)}</strong></div>
          <div><span>Saídas conhecidas</span><strong>{money(report.summary.expenseMinor)}</strong></div>
          <div><span>Compromissos em aberto</span><strong>{money(report.summary.openCommitmentsMinor)}</strong></div>
          <div><span>Movimentos considerados</span><strong>{String(report.summary.transactionCount||0)}</strong></div>
        </div>
        <small>Expira em {new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(report.expiresAtMs))}.</small>
      </>}
    </section>
  </main>;
}
