# NestBalance Runtime Readiness

The application code is designed so the browser uses Firebase only for Authentication.

Financial data, household bootstrap, accounts, Home reads, document metadata, AI analysis and Vault access are server-mediated through `nestbalance-api`. Evidence bytes are uploaded to the API and written to Cloud Storage by the backend.

## Why this matters

The `millionsnest` Firebase/GCP project is shared. This repository MUST NOT deploy its standalone `firestore.rules` or `storage.rules` files over the shared project's global rules. They remain useful for emulator/security certification, but the homologation workflow intentionally deploys only:

- Cloud Run service `nestbalance-api`
- the dedicated NestBalance Firebase Hosting site

## Homologation environment variables

Configure these as GitHub Environment variables under `homologation`:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `NESTBALANCE_RUNTIME_SERVICE_ACCOUNT`
- `FIREBASE_HOSTING_SITE` — must be a dedicated site whose name contains `nestbalance`
- `FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Optional:

- `OPENAI_SECRET_NAME` — Google Secret Manager secret containing the server-only OpenAI API key
- `OPENAI_VISION_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`

The Workload Identity Provider must explicitly authorize this repository and the homologation workflow context. Do not relax a production-only provider merely to make the workflow pass; use an appropriate homologation trust condition.

## Deployment safety

Deployment is manual only. Run **Deploy NestBalance Homologation** from `main` and type the exact confirmation token requested by the workflow.

The workflow refuses generic/shared Hosting site names, requires separate deploy/runtime service accounts, runs the complete validation suite first, deploys Cloud Run with bounded scale, binds the dedicated Hosting target at runtime, deploys Hosting only, and finishes with a Cloud Run health check.

Firestore and Storage rules are intentionally not deployed by this workflow.
