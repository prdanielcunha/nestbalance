const required = [
  'GCP_PROJECT_ID',
  'GCP_PROJECT_NUMBER',
  'GCP_REGION',
  'GCP_WIF_PROVIDER',
  'GCP_DEPLOY_SERVICE_ACCOUNT',
  'NESTBALANCE_RUNTIME_SERVICE_ACCOUNT',
  'FIREBASE_HOSTING_SITE',
  'FIREBASE_STORAGE_BUCKET'
];

const missing = required.filter((key) => !String(process.env[key] || '').trim());
if (missing.length) {
  console.error(`Missing runtime/deploy configuration: ${missing.join(', ')}`);
  process.exit(1);
}

const expected = {
  projectId: 'millionsnest',
  projectNumber: '555464791734',
  region: 'us-central1',
  bucket: 'millionsnest.firebasestorage.app',
  hostingSite: 'mn-nestbalance-555464791734'
};

if (process.env.GCP_PROJECT_ID.trim() !== expected.projectId) {
  console.error('Refusing deploy outside the official MillionsNest project.');
  process.exit(1);
}
if (process.env.GCP_PROJECT_NUMBER.trim() !== expected.projectNumber) {
  console.error('GCP project number does not match MillionsNest.');
  process.exit(1);
}
if (process.env.GCP_REGION.trim() !== expected.region) {
  console.error('NestBalance Cloud Run region must remain us-central1 to match the certified Firebase rewrite.');
  process.exit(1);
}
if (process.env.FIREBASE_STORAGE_BUCKET.trim() !== expected.bucket) {
  console.error('Storage bucket does not match the official MillionsNest bucket.');
  process.exit(1);
}
if (process.env.FIREBASE_HOSTING_SITE.trim() !== expected.hostingSite) {
  console.error('Hosting site must be the dedicated NestBalance site.');
  process.exit(1);
}

const serviceAccountPattern = /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/;
for (const key of ['GCP_DEPLOY_SERVICE_ACCOUNT','NESTBALANCE_RUNTIME_SERVICE_ACCOUNT']) {
  if (!serviceAccountPattern.test(process.env[key].trim())) {
    console.error(`${key} is not a valid Google service account address.`);
    process.exit(1);
  }
}

if (process.env.GCP_DEPLOY_SERVICE_ACCOUNT.trim() === process.env.NESTBALANCE_RUNTIME_SERVICE_ACCOUNT.trim()) {
  console.error('Deploy and runtime service accounts must be different.');
  process.exit(1);
}

const provider = process.env.GCP_WIF_PROVIDER.trim();
if (provider !== 'projects/555464791734/locations/global/workloadIdentityPools/mn-prod-github/providers/github') {
  console.error('Unexpected Workload Identity Provider.');
  process.exit(1);
}

console.log('NestBalance MillionsNest runtime preflight: PASS');
console.log(`Project: ${expected.projectId} (${expected.projectNumber})`);
console.log(`Region: ${expected.region}`);
console.log(`Hosting: ${expected.hostingSite}.web.app`);
console.log(`AI secret requested: ${Boolean(String(process.env.OPENAI_SECRET_NAME || '').trim())}`);
