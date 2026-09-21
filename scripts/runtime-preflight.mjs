const required = [
  'GCP_PROJECT_ID',
  'GCP_REGION',
  'GCP_WIF_PROVIDER',
  'GCP_DEPLOY_SERVICE_ACCOUNT',
  'NESTBALANCE_RUNTIME_SERVICE_ACCOUNT',
  'FIREBASE_HOSTING_SITE',
  'FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID'
];

const missing = required.filter((key) => !String(process.env[key] || '').trim());
if (missing.length) {
  console.error(`Missing runtime/deploy configuration: ${missing.join(', ')}`);
  process.exit(1);
}

const project = process.env.GCP_PROJECT_ID.trim();
if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID.trim() !== project) {
  console.error('NEXT_PUBLIC_FIREBASE_PROJECT_ID must match GCP_PROJECT_ID.');
  process.exit(1);
}

const site = process.env.FIREBASE_HOSTING_SITE.trim().toLowerCase();
if (!site.includes('nestbalance')) {
  console.error('FIREBASE_HOSTING_SITE must be a dedicated NestBalance site. Refusing a generic/shared site.');
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
  console.error('Deploy and runtime service accounts must be different (least privilege).');
  process.exit(1);
}

if (!/^projects\/\d+\/locations\/global\/workloadIdentityPools\/[^/]+\/providers\/[^/]+$/.test(process.env.GCP_WIF_PROVIDER.trim())) {
  console.error('GCP_WIF_PROVIDER has an invalid Workload Identity Provider resource name.');
  process.exit(1);
}

if (!/^https?:\/\//.test(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.trim()) && !/^[a-z0-9.-]+$/i.test(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.trim())) {
  console.error('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is invalid.');
  process.exit(1);
}

console.log('NestBalance runtime/deploy preflight: PASS');
console.log(`Project: ${project}`);
console.log(`Region: ${process.env.GCP_REGION.trim()}`);
console.log(`Hosting site: ${process.env.FIREBASE_HOSTING_SITE.trim()}`);
console.log(`AI secret configured: ${Boolean(String(process.env.OPENAI_SECRET_NAME || '').trim())}`);
