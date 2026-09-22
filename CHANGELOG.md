# Changelog

All notable NestBalance product releases are documented here.

## 1.0.0-rc.1 — 2026-09-22

Release candidate for the initial NestBalance personal/family finance product.

### Product
- Month-first Home with available money, known obligations, future commitments and quiet attention.
- Accounts, cash/wallet balances, movements, recurring commitments, cards, invoices, installments and statement payment semantics.
- Universal Capture for text, screenshots/images, PDF, TXT/CSV and audio, all converging on human review.
- Local-first image reading plus protected, optional Gemini Free fallback using sanitized OCR text only.
- Explainable Assistant, future projections, spending simulation, anomaly/duplicate signals and contextual Vault search.
- Editable/learned categories and user-confirmed recurring suggestions.
- Household roles, invitation-first onboarding, shared activity authorship, Personal vs Household privacy and per-member attention preferences.
- PT-BR, English and Español across the primary product and review flows.
- Installable PWA with API responses excluded from Cache Storage.

### Trust and reliability
- Server-mediated financial data boundary; browser uses Firebase directly only for Authentication.
- Immutable evidence and deduplication/reprocessing protections.
- Explicit card-payment handling to prevent purchase + statement-payment double counting.
- Privacy export/deletion, app-scoped NestBalance session revocation and privacy-safe recent-device visibility.
- Mobile/desktop, dark/light, accessibility, authenticated two-person household and five mandatory demo contracts in release gates.

### Deliberately conditional
- Paid Open Finance remains fail-closed and off unless `NESTBALANCE_ALLOW_PAID_INTEGRATIONS=true` plus provider credentials are deliberately configured.
- Device push delivery is not required by the initial MVP; in-app quiet attention and preferences are the baseline.
- DNS/custom-domain ownership, provider contracts, legal trademark validation, branch protection and GCP backup policy are administrative/control-plane responsibilities rather than application code.
