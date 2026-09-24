# NestBalance — Roadmap Execution Ledger

Source of truth for this execution cycle: **NestBalance avaliação sênior e roadmap de produto**, evaluated at v1.2.8 / commit `49a5852`.

This ledger intentionally follows the roadmap in order. A later phase may be researched or prepared, but it is not marked complete until the preceding phase has evidence for every exit criterion.

## Phase status

| Phase | Status | Exit gate |
| --- | --- | --- |
| 0 — Baseline e pesquisa real | IN PROGRESS | Baseline + 13 moderated participants + top 5 frictions + privacy-safe telemetry |
| 1 — Fundação premium única | PREPARATORY IMPLEMENTATION; CANNOT CLOSE BEFORE PHASE 0 | Unified AppShell + typography/tokens/states + full visual/accessibility gate |
| 2 — Sync em tempo real e resiliência | NOT STARTED | p95 < 2s + two-session concurrency + offline/reconnect safety |
| 3 — Home orientada a decisões | NOT STARTED | 90% comprehension + priority action <= 10s + unknown != zero |
| 4 — Captura sem atrito | NOT STARTED | 80% one-tap common items + p50 < 8s + exception-only review |
| 5 — Inteligência explicável | NOT STARTED | insight precision + critical false positives < 5% + explain/mute |
| 6 — Casal e família | NOT STARTED | privacy proof + shared-state consistency + role onboarding |
| 7 — Performance/arquitetura/observabilidade | NOT STARTED | LCP/INP/CLS/API/bundle SLOs |
| 8 — Integrações e expansão | NOT STARTED | certified consent/revoke/reconciliation + commercial safeguards |

## Phase 1 preparatory work already landed on this branch

This work is deliberately not treated as Phase 1 completion while Phase 0 evidence remains open.

- Shared `AppShell` now owns the primary header/navigation contract.
- Home, Movements, Accounts, Savings Pots, Assistant, Documents, Household and Privacy use the same shell component.
- Desktop (>= 840 px) uses the same inline primary navigation contract; mobile retains the bottom navigation.
- Playwright enforces one `.app-shell-nav` per primary route and verifies fixed-mobile vs inline-desktop behavior.
- The remaining Phase 1 work is typography floor, token/CSS decomposition, global states, full light/dark visual matrix and consistency scoring.

## Phase 0 — engineering baseline

### Current verified baseline

- Release under evaluation: 1.2.8.
- Universal Capture is ~1,235 lines.
- Cofrinhos screen is ~825 lines.
- Global stylesheet is ~2,382 lines.
- Household refresh uses 25-second polling.
- Existing release gates include core tests, authenticated API tests, Firestore Rules, TypeScript, production builds, Playwright and axe.
- Existing visual snapshots cover Home mobile dark and Accounts desktop light, not the complete critical-flow matrix.

### 12 flows to measure

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

For each flow record only duration, step count, success/failure, correction count and coarse error code. Never record financial values, descriptions, document text, filenames, Assistant questions or raw identifiers.

### Instrumentation contract

The first implementation slice adds first-party Web Vitals telemetry:
- fixed metric names only: CLS, FCP, FID, INP, LCP, TTFB;
- route is reduced to a known route key;
- no metric/page-load identifier is transmitted;
- no Household/user identifier is transmitted;
- query strings and hashes are discarded;
- the API logs only metric, rounded value, coarse rating, coarse route and navigation type;
- browser metric failures are silent and cannot block financial tasks.

Existing server request telemetry remains the source for API latency/error baseline because it logs method/path/status/duration and does not inspect financial request bodies.

### Human research protocol — required before Phase 0 exit

Participants: 5 individual users, 5 couples and 3 families.

Moderated sessions must run at least:
- first use on phone;
- first use on desktop;
- one capture from each participant's familiar behavior;
- "what do I need to do now?" interpretation of Home;
- retrieval of an old proof/document;
- for shared users, Household vs Personal mental-model test.

Record task outcome and observation codes, not financial content. Use synthetic or participant-redacted examples whenever possible.

### Phase 0 acceptance evidence still required

- [ ] Field baseline for Time to First Value.
- [ ] Field p50/p95 for simple capture and import.
- [ ] Review abandonment/correction funnel using fixed event names only.
- [ ] 13 moderated research participants completed.
- [ ] Top five frictions ranked by frequency x impact.
- [ ] Privacy inspection confirms zero financial content in telemetry.
- [ ] Phase 0 evidence reviewed before Phase 1 is marked IN PROGRESS.

## Architecture decisions queued for their roadmap phase

### Realtime
Keep the authenticated API as authority. The realtime channel will carry invalidation metadata only, never financial content. Polling remains a backoff fallback. SSE/WebSocket vs a tiny Firebase RTDB invalidation channel must be selected by a measured spike covering multi-instance behavior, p95 latency, reconnects, security rules and monthly cost.

### AI
Keep deterministic finance rules, local parsers/OCR and native document extraction first. Add an internal provider gateway before adding more providers. Raw financial data must not default to a free model tier. Provider/model selection is benchmark-driven and feature-flagged.

### Performance
Do not add a generic analytics SDK in Phase 0. Use Next.js first-party Web Vitals reporting plus existing redacted server request telemetry. Bundle analysis and route budgets enter Phase 7, with early regression guards allowed sooner.
