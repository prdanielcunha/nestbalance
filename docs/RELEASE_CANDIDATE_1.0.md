# NestBalance 1.0 Release Candidate Audit

Source of truth: `NestBalance_Product_Blueprint_Master_v1.1` (September 2026).

This document closes the initial MVP against the blueprint's roadmap, five mandatory demo moments and Definition of Done. It intentionally distinguishes product code from external/control-plane work.

## Roadmap closure

| Phase | Blueprint exit criterion | RC status | Evidence in product/release gates |
| --- | --- | --- | --- |
| 0 — Foundation | Login, Household and navigation work on mobile/desktop with approved visual foundation | PASS | Firebase Auth; server-mediated Household bootstrap; roles; PT-BR/EN/ES runtime locale; structured HTTP telemetry; security headers/rate limits; Browser Quality mobile/desktop gate |
| 1 — Financial core | User controls a full month without AI | PASS | Accounts/cash, movements, commitments, cards, Home/month view, timeline, payments and future commitments all work through deterministic/server paths |
| 2 — Universal input | Screenshot/audio produces a correct record with minimal confirmation | PASS | Text/image/PDF/TXT/CSV/audio converge on Universal Capture review; local/deterministic paths run before optional AI; low confidence asks for explicit review |
| 3 — Statements/installments | Statement creates current view + future commitments without double counting | PASS | Invoice parser/review, installment plan, dedup, statement payment as settlement/transfer; product demo contract protects future installments and excludes statement payment as purchase |
| 4 — Assistant/forecast | Explainable responses linked to source data | PASS | Remaining-to-pay, available-now, future months, spending simulation/change, ending installments, anomalies; source lists and contextual Vault search |
| 5 — Advanced family | Two adults use the same Household without shared credentials | PASS | Invitation-first flow, per-user Google auth, owner/admin/member/read-only, Personal vs Household scopes, activity authorship, privacy rights; authenticated two-person emulator gate |
| 6 — Open Finance | Authorized bank data enters without breaking manual model | CONDITIONAL / NON-BLOCKING MVP | Provider integration, consent, sync, reconciliation and revocation paths exist; paid provider is fail-closed by default. Blueprint explicitly places Open Finance outside the initial MVP |

## Five mandatory demo moments

1. **Pix screenshot -> known commitment:** protected by deterministic payment matching/product demo contract; Universal Capture can attach evidence and prompt the smallest confirmation.
2. **Statement -> installments + review + future month:** protected by invoice parser/review tests, installment projection and no-double-counting semantics.
3. **“I paid 186 for water” audio -> paid bill:** audio transcription flows into the same deterministic financial parser and commitment matching; original evidence stays linked.
4. **“How much is left to pay?”:** Assistant returns a source-linked, verifiable remaining-to-pay calculation.
5. **“Internet receipt from March”:** contextual Vault search is protected by the product demo contract.

## Definition of Done

- **Home explains the month without a tutorial — PASS.** Available now, money in/out, still to pay, expected remainder, future commitments and calm attention are presented in everyday language.
- **No main function requires accounting vocabulary — PASS.** UI copy favors bills, money in/out, paid, available and what remains.
- **Screenshot, audio, text and PDF converge on one review layer — PASS.**
- **Installment statements do not double count purchase and statement payment — PASS.**
- **Evidence stays private and linked to the correct record — PASS.**
- **Two people share a Household with clear authorship and separate credentials — PASS.**
- **Empty/loading/failure/low-confidence states have designed UX — PASS.** RC also removes raw Household backend error codes from user-visible UI.
- **Light/dark mode tested on mobile and desktop — PASS.**
- **Accessibility and responsiveness are release gates — PASS.**
- **AI can say it is unsure and request the smallest confirmation — PASS.**
- **Imports are observable/reprocessable without duplicate records — PASS.** Deduplication, immutable evidence, fingerprints and idempotent commit paths are covered by tests/audit events.
- **Premium visual/finish is deliberate — PASS for implementation baseline.** The app uses its own premium calm design system, mobile-first spacing/hierarchy, semantic color and restrained surfaces rather than inheriting NestFinance organizational UI.

## Release boundaries that must not be faked in application code

These are not application-feature failures and must remain visible:

- Legal trademark/name validation before a broad public launch.
- Provider contract/certification and explicit cost approval before enabling paid Open Finance.
- Firebase/GCP custom-domain ownership/DNS state.
- GCP backup/retention policies that live in the administrative control plane.
- GitHub branch protection/rulesets.
- Optional device push delivery. The MVP baseline is quiet in-app attention; “everything is fine” deliberately produces no alert.

## RC decision

`1.0.0-rc.1` is eligible for production promotion only when the current release branch passes the same CI, authenticated two-person flow, Rules, TypeScript/build, Browser Quality/accessibility/PWA privacy gates, then the production branch passes its deployment preflight and public Hosting/API smoke.
