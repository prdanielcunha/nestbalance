# Changelog

All notable NestBalance product releases are documented here.


## 1.3.2 — 2026-09-25

Premium-shell consistency patch after a route-by-route UI audit.

### Consistency and navigation
- Replaces the remaining legacy authenticated page headers with one shared premium NestBalance top bar across Home, Movements, Accounts, Cofrinhos, Assistant, Documents, Household and Privacy.
- Moves the desktop sidebar breakpoint to 960 px so notebook/tablet-landscape widths no longer fall back to the old floating bottom navigation.
- Keeps true mobile navigation, but locks it to the current dark/light brand surfaces and readable text contrast instead of the pale legacy treatment.
- Preserves the same canonical navigation, permissions, financial scopes and route behavior; this patch changes presentation and responsive shell behavior only.

### Regression coverage
- Adds browser coverage that opens every authenticated product area at 1024 px and verifies the premium header, sidebar layout, no legacy NestBalance eyebrow, no horizontal overflow and no serious accessibility violations.
- Adds a dark-mobile navigation contract for Cofrinhos so the old low-contrast floating bar cannot silently return.


## 1.3.1 — 2026-09-25

Production-certification hotfix for the Premium Experience release.

### Release reliability
- Serializes publication of the official Firebase Hosting site after the matching production API deployment has completed successfully, preventing Hosting from pinning the previous Cloud Run revision during concurrent deploys.
- Keeps the exact certified production SHA as the required health-check release on both the Firebase site and the official custom domain.
- Makes stable GitHub Releases select the matching major/minor release-notes file instead of using the previous 1.2 notes for every version.
- Adds static release-contract checks so the production ordering and release-note selection cannot regress silently.

### Product boundary
- No financial rules, user data, permissions, Firestore Rules, AI behavior, billing or application UX changed in this patch.


## 1.3.0 — 2026-09-24

Premium brand-system and navigation release focused on faster comprehension without changing the financial truth model.

### Brand and shell
- Applies the NestBalance Premium v1.0 palette and official open-B mark across the authenticated product, login and PWA/browser surfaces.
- Uses Graphite #090B10, restrained solid surfaces and Pearl text as the official dark experience; light mode remains explicitly supported.
- Uses Amber for primary action, selection and financial emphasis, while Orchid is reserved for Assistant/intelligence surfaces.
- Replaces duplicated per-screen navigation with one authenticated responsive shell and a collapsible desktop sidebar.
- Keeps mobile navigation compact with 44px minimum touch targets and supports the open-B symbol in the collapsed desktop state.

### Financial context and Home
- Makes Pessoal, Lar and Tudo explicit, explained and persistent while navigating between financial areas.
- Adds a conservative “Você pode usar” amount based only on the available balances and commitments already known to NestBalance.
- Shows a “Falta cobrir” state instead of presenting a negative usable amount when known commitments exceed available balances.
- Keeps the existing Home attention, due-bill, month and future-projection logic grounded in canonical data; no new financial rule or silent assumption is introduced.

### PWA and accessibility
- Adds branded favicon, Apple Touch Icon, installable PWA icons, maskable icons, Open Graph image and phone startup image.
- Centralizes brand tokens in design-system/nestbalance-tokens.css.
- Raises focus and secondary-text contrast to the WCAG AA release gate while preserving reduced-motion behavior.
- Expands authenticated responsive browser coverage to 320, 360, 390, 768, 1024, 1440 and 1920 px.

### Safety boundary
- Firestore Rules, Household roles, privacy scopes, finance-core semantics, canonical repositories, AI human-confirmation boundaries and paid-integration defaults remain unchanged.

## 1.2.2 — 2026-09-22

Real-life input hardening without expanding product scope.

### Financial truth
- Rejects impossible ISO dates instead of persisting normalized calendar mistakes.
- Prevents dates and times pasted before an amount from being interpreted as money.
- Correctly preserves Brazilian thousand separators and OCR-spaced amounts.
- Forces explicit review for card-statement refunds, credits, reversals and cancellations so they cannot become silent expenses.
- Extends Cofrinho OCR for spaced thousands and verifies conflicting cross-bank goals stay explicit.
- Adds month-end and leap-year regression coverage for card cycles and installment schedules.


## 1.2.1 — 2026-09-22

Production-hardening patch focused on preserving the financial truth of a Household across payment, recovery and release operations.

### Reliability
- Extends the authenticated Firebase-emulator flow to verify payment matching, marking a recurring commitment as paid, Home persistence and grounded Assistant answers.
- Verifies that undo restores the previous financial state and removes the generated payment transaction.
- Adds a month-rollover safety contract: an older payment cannot be reversed while a later payment for the same recurring commitment still exists.
- Keeps the existing two-person Household, Personal-vs-Household privacy and NestBalance-only session-revocation checks in the same authenticated gate.

### Release safety
- Production and official-domain workflows now refuse to publish a production tree that differs from the certified `main` tree.
- Static security/runtime verification locks that production-parity invariant so it cannot be removed silently.

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
