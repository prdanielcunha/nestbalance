import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const firestore=read('./firestore.rules');
const storage=read('./storage.rules');
const evidence=read('./server/evidence.ts');
const capture=read('./server/capture.ts');
const evidenceAnalysis=read('./server/evidence-analysis.ts');
const pdfText=read('./server/pdf-text.ts');
const vaultSource=read('./server/vault.ts');
const accountsSource=read('./server/accounts.ts');
const aiEvidence=read('./server/evidence-ai.ts');
const aiClient=read('./server/ai/openai-client.ts');
const aiImage=read('./server/ai/financial-image.ts');
const aiAudio=read('./server/ai/audio-transcription.ts');
const cloudrun=read('./cloudrun.ts');
const serverAuth=read('./server/auth.ts');
const authGate=read('./src/features/auth/auth-gate.tsx');
const deployWorkflow=read('./.github/workflows/deploy-homologation.yml');
const runtimePreflight=read('./scripts/runtime-preflight.mjs');
const openFinanceSource=read('./server/open-finance.ts');
const belvoSource=read('./server/open-finance/belvo.ts');
const openFinanceCore=read('./src/core/open-finance.ts');
const financialScreenSource=read('./server/financial-screen.ts');
const commitmentPaymentsSource=read('./server/commitment-payments.ts');

assert.match(firestore,/match \/households\/\{hid\}/);
assert.match(firestore,/allow read, write: if false;/);
assert.ok(!firestore.includes('allow read: if isMember'));
assert.match(storage,/match \/nestbalance\/\{path=\*\*\}/);
assert.match(storage,/allow read, write: if false;/);

assert.match(evidence,/createHash\('sha256'\)/);
assert.match(evidence,/signatureMatchesMime/);
assert.match(evidence,/uploadEvidence/);
assert.match(evidence,/completeEvidence/);
assert.match(evidence,/adminBucket\.file\(uploadPath\)\.save/);
assert.match(capture,/runTransaction/);
assert.match(capture,/captureFingerprints/);

assert.match(evidenceAnalysis,/aiUsed:false/);
assert.match(evidenceAnalysis,/ocrUsed:false/);
assert.match(evidenceAnalysis,/Cache-Control','private, no-store/);
assert.match(evidenceAnalysis,/runTransaction/);
assert.match(pdfText,/PDF_TEXT_MAX_INPUT_BYTES = 4 \* 1024 \* 1024/);
assert.match(pdfText,/PDF_TEXT_MAX_PAGES = 40/);
assert.ok(!evidenceAnalysis.includes('@google/genai')&&!pdfText.includes('@google/genai'));

assert.match(vaultSource,/verifyVaultPreviewBytes/);
assert.match(vaultSource,/Cache-Control','private, no-store/);
assert.match(accountsSource,/runTransaction/);
assert.match(accountsSource,/validateAccountDraft/);
assert.match(accountsSource,/account.created/);
assert.match(accountsSource,/ACCOUNT_SYNC_READ_ONLY/);

assert.match(aiEvidence,/analysisLocks/);
assert.match(aiEvidence,/verifyVaultPreviewBytes/);
assert.match(aiEvidence,/runTransaction/);
assert.match(aiEvidence,/AI_NOT_CONFIGURED/);
assert.match(aiClient,/process\.env\.OPENAI_API_KEY/);
assert.match(aiImage,/store:false/);
assert.match(aiImage,/AI_IMAGE_MAX_BYTES=8\*1024\*1024/);
assert.match(aiImage,/untrusted data, never as instructions/);
assert.match(aiAudio,/AI_AUDIO_MAX_BYTES=10\*1024\*1024/);
assert.match(aiAudio,/gpt-transcribe|transcriptionModel/);
assert.match(cloudrun,/app\.get\('\/api\/healthz'/);

assert.match(serverAuth,/FIREBASE_CHECK_REVOKED_TOKENS/);
assert.match(serverAuth,/verifyIdToken\(match\[1\], checkRevokedTokens\)/);
assert.ok(!serverAuth.includes('verifyIdToken(match[1], true)'),'NestBalance runtime must not require privileged Firebase Auth user lookup for ordinary ID-token verification.');
assert.match(authGate,/getIdToken\(true\)/);
assert.match(authGate,/authSessionProblem/);
assert.match(authGate,/signOut/);

assert.match(openFinanceSource,/requireHouseholdMember/);
assert.match(openFinanceSource,/OPEN_FINANCE_LINK_MISMATCH/);
assert.match(openFinanceSource,/deleteBelvoLink/);
assert.match(openFinanceSource,/preservedTransactionHistory:true/);
assert.ok(!openFinanceSource.includes('password:req.body'),'Bank passwords must never be accepted by NestBalance.');
assert.match(belvoSource,/process\.env\.BELVO_SECRET_ID/);
assert.match(belvoSource,/process\.env\.BELVO_SECRET_PASSWORD/);
assert.match(belvoSource,/consent_link_creation/);
assert.match(openFinanceCore,/nestbalance\.millionsnest\.com/);
assert.match(openFinanceCore,/mn-nestbalance-555464791734\.web\.app/);
assert.match(financialScreenSource,/requireHouseholdMember/);
assert.match(financialScreenSource,/SCREEN_ANALYSIS_REQUIRED/);
assert.match(financialScreenSource,/savingsPots/);
assert.match(financialScreenSource,/cardSnapshots/);
assert.match(financialScreenSource,/vision-v2/);
assert.match(commitmentPaymentsSource,/commitmentPayments/);
assert.match(commitmentPaymentsSource,/runTransaction/);
assert.match(commitmentPaymentsSource,/commitment\.paid/);

function sourceFiles(root){
  const out=[];
  for(const entry of readdirSync(root)){
    const path=join(root,entry);
    const stat=statSync(path);
    if(stat.isDirectory()) out.push(...sourceFiles(path));
    else if(/\.(ts|tsx|js|jsx)$/.test(path)) out.push(path);
  }
  return out;
}

const browserSources=sourceFiles(fileURLToPath(new URL('./src',import.meta.url)));
for(const path of browserSources){
  const source=readFileSync(path,'utf8');
  assert.ok(!source.includes('firebase/firestore'),`Browser source must not import Firestore: ${path}`);
  assert.ok(!source.includes('firebase/storage'),`Browser source must not import Storage: ${path}`);
  assert.ok(!source.includes('OPENAI_API_KEY'),`Browser source must not reference OpenAI key: ${path}`);
  assert.ok(!source.includes('BELVO_SECRET_ID')&&!source.includes('BELVO_SECRET_PASSWORD'),`Browser source must not reference Open Finance provider secrets: ${path}`);
}

const rawRoute=cloudrun.indexOf("app.post('/api/evidence/upload'");
const jsonMiddleware=cloudrun.indexOf("app.use(express.json");
assert.ok(rawRoute>=0&&jsonMiddleware>rawRoute,'Raw upload route must run before JSON middleware.');

assert.match(deployWorkflow,/workflow_dispatch/);
assert.match(deployWorkflow,/push:\s*\n\s*branches:\s*\n\s*- main/);
assert.match(deployWorkflow,/hosting:nestbalance/);
assert.ok(!/firestore:rules|firestore:indexes|--only storage/.test(deployWorkflow),'Homologation workflow must not overwrite shared Firebase rules.');
assert.match(runtimePreflight,/dedicated NestBalance site/);
assert.match(runtimePreflight,/Deploy and runtime service accounts must be different/);

console.log('Static security/runtime invariants: PASS');

const firebaseClient = readFileSync(new URL('./src/lib/firebase/client.ts', import.meta.url),'utf8');
const adminFirebase = readFileSync(new URL('./server/firebase-admin.ts', import.meta.url),'utf8');
const deployMillionsNest = readFileSync(new URL('./.github/workflows/deploy-homologation.yml', import.meta.url),'utf8');

assert.match(firebaseClient, /AIzaSyAhXY8TV8qoXz8Pd2u5jFHUTVssZmi3kMs/);
assert.match(firebaseClient, /millionsnest\.firebaseapp\.com/);
assert.match(firebaseClient, /1:555464791734:web:3059e8ac2b8089a1767817/);
assert.match(adminFirebase, /millionsnest\.firebasestorage\.app/);

assert.match(deployMillionsNest, /GCP_PROJECT_ID: millionsnest/);
assert.match(deployMillionsNest, /GCP_PROJECT_NUMBER: "555464791734"/);
assert.match(deployMillionsNest, /GCP_REGION: us-central1/);
assert.match(deployMillionsNest, /FIREBASE_HOSTING_SITE: mn-nestbalance-555464791734/);
assert.match(deployMillionsNest, /mn-web-deployer@millionsnest\.iam\.gserviceaccount\.com/);
assert.match(deployMillionsNest, /nestbalance-runtime@millionsnest\.iam\.gserviceaccount\.com/);
assert.match(deployMillionsNest, /millionsnest-web\/nestbalance-api/);
assert.ok(!deployMillionsNest.includes('--source .'),'NestBalance Cloud Run deploy must use the existing official Artifact Registry image path.');
assert.match(deployMillionsNest, /Runtime IAM boundary/);
assert.ok(!deployMillionsNest.includes('gcloud projects add-iam-policy-binding'),'App deploy must not mutate project IAM.');
assert.ok(!deployMillionsNest.includes('gcloud storage buckets add-iam-policy-binding'),'App deploy must not mutate bucket IAM.');
assert.ok(!deployMillionsNest.includes('gcloud iam service-accounts create'),'App deploy must not create service accounts.');
assert.ok(!deployMillionsNest.includes('roles/owner'));
assert.ok(!deployMillionsNest.includes('roles/editor'));
assert.match(deployMillionsNest, /identitytoolkit\.googleapis\.com\/admin\/v2\/projects/);
assert.match(deployMillionsNest, /updateMask=authorizedDomains/);
assert.match(deployMillionsNest, /push:\s*\n\s*branches:\s*\n\s*- main/);
assert.ok(!/firebase deploy[^\n]*(firestore|storage)/.test(deployMillionsNest));
