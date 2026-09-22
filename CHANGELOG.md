# Changelog

All notable NestBalance product releases are documented here.

## 1.2.0 — 2026-09-22

Cofrinhos become a complete savings-goal experience while preserving NestBalance's usable-only product rule.

### Cofrinhos
- Create manually or import several at once from a bank screenshot.
- Add a private cover photo, name, initial saved amount, goal, deadline, source and personal note.
- Track progress, remaining amount and suggested monthly/weekly pace toward a dated goal.
- Reserve and withdraw amounts with an auditable history, without classifying movement between the user's own funds as income or spending.
- Consolidate the same goal across institutions while keeping each source visible.
- Re-import bank screenshots idempotently so balances update instead of duplicating pots.
- Automate NestBalance tracking daily, weekly, every 15 days, monthly, when spending, when receiving income, or by rounding expenses up to the next whole real.
- Fixed-amount and percentage rules are supported where applicable, with idempotent event processing and Personal/Household scope isolation.
- Imported bank pots remain bank mirrors: NestBalance does not invent automatic movements for them; a later screenshot refreshes their real-world balance.
- Finish/archive a pot after its tracked balance reaches zero.

### Trust and privacy
- Cofrinho photos are private server-mediated assets with authenticated preview and file-signature validation.
- Privacy export/deletion includes Cofrinho activity and automation records while removing private storage paths from exported metadata.
- Personal-data deletion removes associated private cover files.
- NestBalance does not promise bank yield or send transfer/payment orders from Cofrinho controls.

## 1.1.0 — 2026-09-22

Premium product finish focused on showing only what users can actually use, reducing setup friction and making every primary flow clearer on mobile and desktop.

### Product and UX
- Promotes Cofrinhos to a primary navigation area with consolidated goals, screenshot-first import, deduplication across repeated imports and per-source editing.
- Keeps Documentos as the secondary financial memory: originals are preserved, searchable by remembered context and directly reachable from capture flows.
- Removes unavailable Open Finance from navigation, Accounts, public routes and the current API surface. Legacy synchronized account records can be converted into normal manually maintained accounts when edited.
- Improves first use with two obvious paths: enter a current balance or send a screenshot/file.
- Adds action-oriented empty states and clearer cross-navigation between Home, Accounts, Movements, Cofrinhos and Documentos.
- Refreshes Accounts, Movements, Cofrinhos and Documentos when the app regains focus so recently captured data appears without manual reloads.
- Replaces the ambiguous avatar-only Household entry with an explicit localized Household control.

### Visual system
- Adds a premium, low-noise visual layer with translucent sticky top bars, calmer gradients, refined elevation, balanced typography and durable surface tokens.
- Improves light and dark themes independently, including browser/PWA chrome colors.
- Uses responsive auto-fit financial grids, clearer mobile stacking, stronger 44px+ touch targets, focus-visible treatment and pointer-aware hover motion.
- Keeps motion subtle and functional while honoring reduced-motion preferences.

### Release boundary
- Open Finance remains a future phase and is intentionally not exposed until it is genuinely operational and intended for use.
- Browser financial data access remains server mediated; existing privacy, evidence, deduplication and human-confirmation boundaries are preserved.

## 1.0.0 — 2026-09-22

First stable NestBalance personal/family finance release, promoted after the complete `1.0.0-rc.1` production certification passed on the official domain.

### Stable release
- Closes blueprint MVP phases 0–5 and all five mandatory demonstration moments.
- Keeps paid Open Finance fail-closed and outside the initial MVP, as frozen by the product blueprint.
- Certifies Universal Capture, cards/invoices/installments, explainable Assistant, contextual Vault, household collaboration, privacy/session controls, PT-BR/EN/ES and the installable PWA.
- Production release gates passed CI, Firestore Rules, authenticated two-person API flow, TypeScript/build, Browser Quality/accessibility, container smoke, Cloud Run deployment, Firebase Hosting deployment and official-domain health/PWA checks.
- Paid integrations remain disabled by default; the stable release does not introduce a paid-service dependency.

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
