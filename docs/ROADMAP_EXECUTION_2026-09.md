# NestBalance — Roadmap Execution Ledger

Source of truth for this execution cycle: **NestBalance avaliação sênior e roadmap de produto**, evaluated at v1.2.8 / commit `49a5852`.

This ledger separates **engineering implementation** from **formal roadmap exit evidence**. Code can be complete while a phase remains formally open because moderated research, real-device field latency, production SLOs or third-party certification cannot be manufactured in CI.

## Phase status

| Phase | Engineering status | Formal exit evidence still open |
| --- | --- | --- |
| 0 — Baseline e pesquisa real | ENGINEERING BASELINE COMPLETE | Field TTFV/capture/import baseline, 13 moderated participants, top 5 frictions, production privacy review |
| 1 — Fundação premium única | ENGINEERING COMPLETE | Human visual/comprehension review on the full critical-flow matrix |
| 2 — Sync em tempo real e resiliência | ENGINEERING COMPLETE | Real-network p95 and homologation/production verification on the exact promoted SHA |
| 3 — Home orientada a decisões | ENGINEERING COMPLETE | 90% comprehension and priority action <= 10s in moderated sessions |
| 4 — Captura sem atrito | ENGINEERING COMPLETE | 80% one-tap common items and field p50 < 8s |
| 5 — Inteligência explicável | ENGINEERING COMPLETE | Field precision evidence and critical false positives < 5% |
| 6 — Casal e família | ENGINEERING COMPLETE | Human privacy/role mental-model evidence |
| 7 — Performance/arquitetura/observabilidade | ENGINEERING COMPLETE | Production LCP/INP/CLS/API/crash-free SLO measurements |
| 8 — Integrações e expansão | FOUNDATION COMPLETE; CERTIFICATION-GATED | Open Finance provider/contract/cost/consent/revoke/reconciliation certification |

No phase with external evidence above is represented as formally closed until that evidence exists.

## Engineering implementation delivered

### Phase 0 — measurable baseline without financial telemetry

- First-party Web Vitals use fixed metric names and coarse route/navigation metadata only.
- Request metrics remain content-blind; product events use fixed event/category values rather than financial text or values.
- Capture correction telemetry records only fixed correction categories.
- Research kit and visual inventory define the moderated protocol and the 320/390/768/1024/1440/1920 responsive matrix.
- Static security gates reject accidental financial identifiers/content in product telemetry.

### Phase 1 — one premium product foundation

- Shared `AppShell` owns the primary header/navigation contract across critical authenticated areas.
- Mobile and desktop navigation share one contract; desktop is inline and mobile remains task-oriented.
- Typography floor, financial tabular numbers, dark/light behavior, global states and responsive constraints are enforced in the product and browser gates.
- Home, Movements, Accounts, Savings Pots, Assistant, Documents, Household, Privacy, Inbox, Together and Support use the same product shell where applicable.
- Browser quality uses Playwright + axe and a fixed authenticated viewport matrix.

### Phase 2 — realtime and resilience

- Authenticated SSE invalidation carries revision/domain/timestamp metadata only; no financial payload is sent through the realtime channel.
- Domain-aware refresh updates Home, movements, accounts/invoices, savings pots and collaboration surfaces.
- Polling remains a fallback and backs off up to 120 seconds.
- User-visible states cover updating, offline, failed, pending, remote change and conflict.
- IndexedDB queues only mutations individually designed as safe/idempotent; evidence/file uploads are not silently queued.
- Account edits carry the revision seen by the editor and reject stale writes with an explicit conflict.
- Authenticated API tests prove two-session invalidation and stale-write protection in the emulator.

### Phase 3 — Home oriented to decisions

- Home separates available money, known commitments and projected remainder instead of presenting unknown values as zero.
- Attention/next-action derivation is centralized and deterministic.
- First-use, month narrative, future commitments and recent movement sections are explicit and reusable.
- Heavy onboarding/card editors are deferred so the decision surface arrives first.

### Phase 4 — universal capture with human review

- Capture accepts text, audio, screenshots/images, PDF/CSV and paste flows from one entry point.
- Local/native extraction runs before external AI fallback where supported.
- Ambiguous amount/direction and low-confidence interpretations require human confirmation.
- Review supports direct correction of description, value, due day and direction before saving.
- Capture flow IDs are ephemeral and content-free; correction telemetry is categorical only.
- The former monolith was split into a small composition wrapper, focused input/review views and a controller.

### Phase 5 — explainable financial intelligence

- Explainable rules cover possible duplicates, unusual increases, month-over-month change, recurring subscriptions, due bills and savings-pot suggestions.
- Every surfaced signal has source IDs, a premise, confidence, urgency and a review action.
- Users can mute intelligence topics and select a minimum urgency threshold.
- Scenario simulation never mutates real data.
- Monthly close requires explicit exception checks instead of pretending incomplete data is complete.

### Phase 6 — couple and family collaboration

- Together / Household Center adds shared tasks, authored comments/mentions, expense splits/settlement and a weekly ritual.
- Personal-scope entities are rejected from shared collaboration paths.
- Invite onboarding explicitly explains Household versus Personal visibility.
- Realtime invalidation keeps shared state aligned while role permissions remain authoritative.

### Phase 7 — performance, architecture and observability

- `src/features` has a hard 400-line file budget with no legacy exceptions.
- Home, Household, Savings Pots and Universal Capture were split to remove prior component debt.
- Route bundle budgets understand Next 16 static export output and are CI-enforced.
- Heavy OCR/editor code is deferred from the initial Home bundle.
- Crash telemetry is redacted to crash kind, coarse route and online state; no stack/message/financial content is sent.
- SLO/runbooks cover API availability/errors, sync latency, capture latency, crash-free sessions and Core Web Vitals.

### Phase 8 — integration/commercial foundation

- Importer registry covers universal text, generic CSV, native PDF, screenshots, card statements, account screens and savings-pot screens.
- Financial Inbox provides one exception-first queue for documents, invoices, movements and commitments.
- Universal Search finds only entities visible to the signed-in user and respects Personal visibility.
- Accounting CSV export remains available for the user's own data independent of commercial plan.
- Shared monthly reports are aggregate-only Household summaries with random hashed 7-day tokens and no individual descriptions/documents.
- Plans are modeled, but commercial enforcement remains disabled during beta.
- Support diagnostics expose technical state without financial content.
- Family beta is explicit opt-in and records only weekly presence, not financial content.
- Open Finance executable routes/UI remain deliberately **unexposed** until the certification gate is satisfied.

## Release-gate contract

Every promoted SHA must pass:
- dependency audit;
- core tests and static privacy/security invariants;
- Firestore Rules emulator tests;
- authenticated API emulator flow;
- TypeScript;
- production web build;
- per-route bundle budgets;
- Cloud Run API build;
- Chromium responsive/accessibility/browser smoke.

The CI result on the exact branch head is authoritative; this document does not override a failed workflow.

## Field evidence still required before formal roadmap closure

The following cannot be honestly produced by code or CI:

- [ ] Time to First Value baseline from real use.
- [ ] p50/p95 simple capture and import under realistic devices/networks.
- [ ] Review abandonment/correction funnel from real sessions.
- [ ] 13 moderated participants completed: 5 individuals, 5 couples and 3 families.
- [ ] Top five frictions ranked by observed frequency x impact.
- [ ] Production privacy inspection confirming zero financial content in telemetry/logging.
- [ ] Phase 2 realtime p95 under realistic networks on the exact promoted SHA.
- [ ] Phase 3 Home comprehension >= 90% and priority action <= 10 seconds.
- [ ] Phase 4 one-tap success >= 80% for common capture items and p50 < 8 seconds.
- [ ] Phase 5 measured insight precision and critical false positives < 5%.
- [ ] Phase 6 moderated Household-vs-Personal and role mental-model validation.
- [ ] Phase 7 production LCP p75 < 2.5s, INP p75 < 200ms, CLS < 0.1, API >= 99.9%, 5xx < 0.5%, sync p95 < 2s and crash-free sessions > 99.8%.
- [ ] Open Finance provider, contract/cost, consent, revocation and reconciliation certification.

## Research and privacy protocol

For field flows record only duration, step count, success/failure, correction count and coarse error codes. Never record financial values, descriptions, document text, filenames, Assistant questions or raw user/Household identifiers.

The 12 critical flows remain:
1. Sign in -> Household ready.
2. First account/balance -> first useful Home.
3. Understand available / still-to-pay / projected remainder.
4. Add a simple text expense or income.
5. Paste/share a Pix screenshot.
6. Record and understand an audio capture.
7. Import a card invoice/PDF.
8. Resolve a low-confidence review exception.
9. Mark a commitment paid and undo it.
10. Find an old movement/evidence/document.
11. Create/import/update a Savings Pot.
12. Invite a second adult and use Household vs Personal safely.

The moderated sessions must cover phone and desktop first use, familiar capture behavior, Home interpretation, proof/document retrieval and Household-vs-Personal understanding for shared users.
