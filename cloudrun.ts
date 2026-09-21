import express from 'express';
import { commitCapture } from './server/capture.js';
import { finalizeEvidence, startEvidence } from './server/evidence.js';
import { analyzeEvidenceText } from './server/evidence-analysis.js';
import { getVaultEvidenceDetail, listVaultEvidence, previewVaultEvidence } from './server/vault.js';
import { createAccount } from './server/accounts.js';
import { analyzeEvidenceWithAi } from './server/evidence-ai.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'nestbalance-api' }));
app.post('/api/evidence/start', startEvidence);
app.post('/api/evidence/finalize', finalizeEvidence);
app.post('/api/evidence/analyze-text', analyzeEvidenceText);
app.post('/api/evidence/analyze-ai', analyzeEvidenceWithAi);
app.post('/api/vault/list', listVaultEvidence);
app.post('/api/vault/detail', getVaultEvidenceDetail);
app.post('/api/vault/preview', previewVaultEvidence);
app.post('/api/capture/commit', commitCapture);
app.post('/api/accounts/create', createAccount);
app.use((_req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));

const port = Number(process.env.PORT || 8080);
app.listen(port, '0.0.0.0', () => console.log(`nestbalance-api listening on ${port}`));
