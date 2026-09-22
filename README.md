# NestBalance

## Stable release

Current stable version: **1.2.0**. The current product/release closure is documented in `docs/RELEASE_1.2.md`; the 1.1 and 1.0 certification history remains in the prior release notes. Privacy-safe measurement is documented in `docs/PRODUCT_METRICS.md`.

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
- premium Documents memory with contextual search, server-mediated detail and original preview
- consolidated Cofrinhos with screenshot-first import, manual creation, photos, goals, deadlines, history and assistive automations, with cross-bank grouping and transfer-safe semantics
- virtual future projections for recurring commitments and installments
- PT-BR / EN / ES runtime localization across the primary financial, family, assistant and privacy flows
- editable and learned spending categories, explainable anomalies and quiet per-member attention preferences
- household invitations, roles, authorship/activity and Personal vs Household privacy scopes
- app-scoped session revocation and privacy-safe recent-device visibility
- installable PWA shell with strict API network-only caching boundary
- premium responsive light/dark design system with mobile-first layouts, explicit focus states and 44px+ touch targets

## Current product boundary

Only features that are usable now are exposed in the product. Open Finance remains future/dormant implementation material and is not present in navigation, screens, callback/terms routes, or the current API surface. Accounts are usable manually and through the Universal Capture/import flows.

## Browser security boundary

The browser uses Firebase only for Authentication.

Household bootstrap, Home data, accounts, financial commits, evidence metadata, document analysis, AI analysis and Vault access are handled by `nestbalance-api`. Evidence bytes are uploaded through the API and written to Cloud Storage by the backend.

The repository's `firestore.rules` and `storage.rules` intentionally deny direct NestBalance browser data access and are used by the emulator security suite.

**Do not deploy these standalone rules over the shared MillionsNest Firebase project.** Firebase rules are global to the project and must not overwrite the ecosystem's shared rule set.

## Validation

```bash
npm run check
npm run test:rules
npm run test:authenticated-api
npm run typecheck
npm run build
npm run build:cloudrun
npm run test:e2e
```

CI runs the core/security suite, Firestore Rules emulator, an authenticated two-person household API flow, typecheck and both web/API builds before a slice is merged. Browser Quality separately exercises mobile/desktop rendering, accessibility and the PWA cache privacy boundary.

## Homologation deployment

A guarded manual workflow is included at `.github/workflows/deploy-homologation.yml`.

It deploys only:

- `nestbalance-api` to Cloud Run
- the dedicated NestBalance Firebase Hosting site

It does not deploy Firestore or Storage rules. Required environment variables and trust requirements are documented in `docs/RUNTIME_READINESS.md`.
