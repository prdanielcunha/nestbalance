import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const firestore = readFileSync(new URL('./firestore.rules', import.meta.url),'utf8');
const storage = readFileSync(new URL('./storage.rules', import.meta.url),'utf8');
const evidence = readFileSync(new URL('./server/evidence.ts', import.meta.url),'utf8');
assert.match(firestore, /match \/households\/\{hid\}/);
assert.match(firestore, /getAfter\(\/databases\/\$\(database\)\/documents\/households\/\$\(hid\)\)/);
assert.match(firestore, /request\.auth\.uid == resource\.data\.ownerUid/);
assert.match(firestore, /request\.resource\.data\.role in \['admin','member','viewer'\]/);
assert.match(firestore, /match \/evidenceHashes\/\{id\}/);
assert.match(firestore, /match \/captureFingerprints\/\{id\}/);
assert.match(firestore, /allow read, write: if false;/);
assert.match(storage, /evidence\(hid, evidenceId\)\.status == 'awaiting_upload'/);
assert.match(storage, /request\.resource\.size == evidence\(hid, evidenceId\)\.declaredSize/);
assert.match(storage, /allow update, delete: if false;/);
assert.match(evidence, /createHash\('sha256'\)/);
assert.match(evidence, /signatureMatchesMime/);
const capture = readFileSync(new URL('./server/capture.ts', import.meta.url),'utf8');
assert.match(capture, /runTransaction/);
assert.match(capture, /captureFingerprints/);
console.log('Static security invariants: PASS');

const evidenceAnalysis = readFileSync(new URL('./server/evidence-analysis.ts', import.meta.url),'utf8');
const pdfText = readFileSync(new URL('./server/pdf-text.ts', import.meta.url),'utf8');
assert.match(evidenceAnalysis, /aiUsed:false/);
assert.match(evidenceAnalysis, /ocrUsed:false/);
assert.match(evidenceAnalysis, /extractions/);
assert.match(pdfText, /PDF_TEXT_MAX_INPUT_BYTES = 4 \* 1024 \* 1024/);
assert.match(pdfText, /PDF_TEXT_MAX_PAGES = 40/);
assert.ok(!evidenceAnalysis.includes('@google/genai') && !pdfText.includes('@google/genai'));

assert.match(evidenceAnalysis, /Cache-Control','private, no-store/);
assert.match(evidenceAnalysis, /runTransaction/);

const vaultSource = readFileSync(new URL('./server/vault.ts', import.meta.url),'utf8');
assert.match(firestore, /match \/evidenceAssets\/\{id\}[\s\S]*allow read, create, update, delete: if false/);
assert.match(storage, /match \/nestbalance\/households\/\{hid\}\/evidence\/\{evidenceId\}\/original[\s\S]*allow read: if false/);
assert.match(vaultSource, /verifyVaultPreviewBytes/);
assert.match(vaultSource, /Cache-Control','private, no-store/);

const accountsSource = readFileSync(new URL('./server/accounts.ts', import.meta.url),'utf8');
assert.match(firestore, /match \/accountKeys\/\{id\}/);
assert.match(accountsSource, /runTransaction/);
assert.match(accountsSource, /validateAccountDraft/);
assert.match(accountsSource, /account.created/);
