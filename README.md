# NestBalance

NestBalance is the personal and family finance product of the MillionsNest ecosystem.

## Current executable slice

The application now includes:

- Firebase Authentication with server-mediated household bootstrap
- first-balance onboarding for bank account, wallet or cash
- Home with available balance, current month, attention and future commitments
- Universal Capture for text, lists, images, PDFs, TXT/CSV and audio
- deterministic parsers before AI
- native PDF text extraction with strict budgets
- AI vision for financial images with Structured Outputs and human confirmation
- audio transcription followed by the deterministic finance parser
- transfer semantics so transfers between own accounts do not become income/expense
- immutable evidence, SHA-256 deduplication and race-safe capture deduplication
- premium Vault with server-mediated detail and original preview
- virtual future projections for recurring commitments and installments
- PT-BR / EN / ES message architecture
- responsive light/dark design foundation

## Browser security boundary

The browser uses Firebase only for Authentication.

Household bootstrap, Home data, accounts, financial commits, evidence metadata, document analysis, AI analysis and Vault access are handled by `nestbalance-api`. Evidence bytes are uploaded through the API and written to Cloud Storage by the backend.

The repository's `firestore.rules` and `storage.rules` intentionally deny direct NestBalance browser data access and are used by the emulator security suite.

**Do not deploy these standalone rules over the shared MillionsNest Firebase project.** Firebase rules are global to the project and must not overwrite the ecosystem's shared rule set.

## Validation

```bash
npm run check
npm run test:rules
npm run typecheck
npm run build
npm run build:cloudrun
```

CI runs the same gates before a slice is merged.

## Homologation deployment

A guarded manual workflow is included at `.github/workflows/deploy-homologation.yml`.

It deploys only:

- `nestbalance-api` to Cloud Run
- the dedicated NestBalance Firebase Hosting site

It does not deploy Firestore or Storage rules. Required environment variables and trust requirements are documented in `docs/RUNTIME_READINESS.md`.
