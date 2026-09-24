# NestBalance — SLOs, alertas e runbooks

Data: 2026-09-24

Este documento transforma os critérios do roadmap em limites operacionais. Nenhum alerta, log ou métrica pode conter valores financeiros, descrições, nomes, prompts, OCR, imagens ou documentos.

## SLOs

| Sinal | Meta | Janela | Ação quando viola |
|---|---:|---:|---|
| Disponibilidade da API | >= 99,9% | 30 dias | verificar Cloud Run, Firebase e release |
| Erros HTTP 5xx | < 0,5% | 1 hora e 24 horas | comparar por rota/release; rollback se regressão |
| Sync entre aparelhos | p95 < 2 s | 1 hora | verificar stream, reconexões e fallback |
| Captura simples | p50 < 8 s | 24 horas | separar receiving/reading/understanding/comparing/confirmation |
| Crash-free sessions | > 99,8% | 24 horas e 7 dias | comparar client_crash / session_observed |
| LCP móvel | p75 < 2,5 s | 7 dias | inspecionar rota e bundle |
| INP | p75 < 200 ms | 7 dias | identificar handlers longos e componentes |
| CLS | < 0,1 | 7 dias | revisar layout shift por rota |
| Importações corrigidas | < 15% | 7 dias | segmentar por tipo de entrada |
| Alertas críticos falsos | < 5% | avaliação rotulada | desligar tipo/regra se ultrapassar limite |

## Runbook — API

1. Confirmar environment e release nos logs http_request.
2. Agrupar apenas por rota, status e release.
3. Se a regressão começou no release atual, pausar promoção e usar rollback.
4. Nunca copiar body, Authorization ou conteúdo financeiro para incidentes.
5. Validar Auth/Firestore/Storage separadamente antes de aumentar recursos.

## Runbook — sincronização

1. Verificar se o stream autenticado está entregando revision/domains/changedAt.
2. Medir latência entre audit event e invalidação recebida.
3. Se o stream falhar, confirmar que polling com backoff permanece ativo.
4. Conferir remoção de membro e troca de Lar; nenhum evento deve permitir inferir conteúdo financeiro.
5. Se p95 >= 2 s em campo, revisar infraestrutura antes de reduzir polling agressivamente.

## Runbook — Captura

1. Usar flowId efêmero para juntar etapas técnicas da mesma captura.
2. Localizar a etapa lenta: receiving, reading, understanding, comparing ou confirmation.
3. Se OCR/IA externa degradar, manter parser local e revisão manual disponíveis.
4. Nunca registrar texto, arquivo, valor, nome ou resposta do modelo.
5. Reprocessamento deve continuar idempotente por fingerprint/hash.

## Runbook — Web Vitals e bundle

1. Identificar rota afetada nos eventos product_web_vital.
2. Rodar npm run budget:bundle depois de build.
3. OCR continua carregado dinamicamente.
4. Um aumento de budget exige justificativa explícita em PR; reduzir antes de ampliar quando possível.

## Runbook — crashes

client_crash registra somente kind, rota e estado online. Mensagem e stack são deliberadamente descartadas.

1. Comparar quantidade de client_crash com session_observed.
2. Correlacionar com release e rota no backend apenas por agregação.
3. Reproduzir no ambiente de homologação sem dados reais.
4. Rollback quando a regressão for associada ao SHA promovido.

## Alertas acionáveis

Configurar alertas na infraestrutura apenas quando houver volume de produção suficiente para evitar ruído:
- 5xx >= 0,5% por 10 minutos;
- disponibilidade < 99,9%;
- sync p95 >= 2 s por 15 minutos;
- crash-free < 99,8% em janela com amostra mínima;
- LCP/INP fora do SLO por rota durante 7 dias.

Os thresholds não autorizam envio de conteúdo financeiro à ferramenta de observabilidade.
