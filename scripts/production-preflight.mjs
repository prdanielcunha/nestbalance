const required=[
  'GCP_PROJECT_ID','GCP_PROJECT_NUMBER','GCP_REGION','GCP_WIF_PROVIDER','GCP_DEPLOY_SERVICE_ACCOUNT',
  'NESTBALANCE_RUNTIME_SERVICE_ACCOUNT','FIREBASE_HOSTING_SITE','FIREBASE_STORAGE_BUCKET','NESTBALANCE_API_SERVICE'
];

const missing=required.filter(key=>!String(process.env[key]||'').trim());
if(missing.length){console.error('Missing production configuration: '+missing.join(', '));process.exit(1);}

const exact={
  GCP_PROJECT_ID:'millionsnest',
  GCP_PROJECT_NUMBER:'555464791734',
  GCP_REGION:'us-central1',
  FIREBASE_STORAGE_BUCKET:'millionsnest.firebasestorage.app',
  FIREBASE_HOSTING_SITE:'mn-nb-prod-555464791734',
  NESTBALANCE_API_SERVICE:'nestbalance-api-prod',
  GCP_WIF_PROVIDER:'projects/555464791734/locations/global/workloadIdentityPools/mn-prod-github/providers/github'
};

for(const [key,value] of Object.entries(exact)){
  if(String(process.env[key]||'').trim()!==value){
    console.error(key+' does not match the certified NestBalance production boundary.');
    process.exit(1);
  }
}

if(!process.env.GITHUB_REF?.endsWith('/production')){
  console.error('Production deploy is allowed only from the production branch.');
  process.exit(1);
}
if(String(process.env.NEXT_PUBLIC_NESTBALANCE_E2E||'').toLowerCase()==='true'){
  console.error('Authenticated E2E fixture mode must never be enabled in production.');
  process.exit(1);
}
if(process.env.GCP_DEPLOY_SERVICE_ACCOUNT===process.env.NESTBALANCE_RUNTIME_SERVICE_ACCOUNT){
  console.error('Deploy and runtime identities must remain separated.');
  process.exit(1);
}
console.log('NestBalance production preflight: PASS');
