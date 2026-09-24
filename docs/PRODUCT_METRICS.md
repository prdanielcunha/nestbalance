# NestBalance Product & Quality Metrics

The blueprint says to measure reduction of effort, not number of screens. NestBalance therefore avoids adding third-party behavioral analytics to the RC just to manufacture dashboards. The initial measurements use existing operational/audit data and aggregate reporting when needed.

| Blueprint metric | Privacy-safe measurement source |
| --- | --- |
| Time to First Value | Household creation timestamp -> first useful Home entity (account, transaction, commitment, confirmed invoice or recognized balance). Can be derived server-side without storing screen behavior. |
| Auto-resolution rate | Capture/import result confidence and review-required fields vs committed items. |
| Correction rate | Explicit review/update actions on imported/captured entities; corrections are already auditable rather than silent overwrites. |
| Duplicate prevented | Dedup/fingerprint/idempotency outcomes for captures, evidence, invoice items and payments. |
| Evidence retrieval success | Vault search queries can be measured as aggregate success/failure without logging the financial query text. Do not store raw search phrases in telemetry. |
| Weekly Household active | Existing member `lastSeenAt` values, aggregated by Household/week. |
| Bill completion before due | Commitment payment timestamp vs due date/day. |
| Import latency p50/p95 | Existing structured HTTP duration telemetry for evidence/import/AI endpoints; request bodies and financial values are excluded. |
| Crash/error-free sessions | HTTP 5xx/error telemetry plus the first-party client crash collector. The collector emits only crash kind, coarse route and online state; it excludes messages, stacks, identifiers and financial content. |
| Accessibility QA pass | Browser Quality + axe serious/critical gate on every release. |

## Data minimization rules

1. Do not send transaction descriptions, evidence text, account balances, card numbers, uploaded files or Assistant questions to generic analytics.
2. Prefer counts, durations, booleans and coarse operation names.
3. Personal-scope financial content remains personal; aggregate product metrics must not make it visible to other Household members.
4. Metrics are for product quality, not advertising or credit profiling.
5. If a future analytics vendor is introduced, it requires an explicit privacy review before any SDK is added.

## RC instrumentation posture

The RC already has structured HTTP telemetry, audit events, dedup outcomes, member last-seen timestamps and release quality gates. That is sufficient to start measuring the blueprint metrics without introducing an invasive client analytics dependency.


## Phase 0 field-performance baseline

Starting with the roadmap execution cycle on 2026-09-24, the web client uses Next.js `useReportWebVitals` and sends only the following fixed fields to `/api/metrics/web-vital`:

- metric name: CLS, FCP, FID, INP, LCP or TTFB;
- rounded metric value;
- coarse rating;
- coarse route key;
- navigation type.

The payload deliberately excludes metric/page-load identifiers, user IDs, Household IDs, URLs with query strings, financial values and user-authored content. The endpoint reduces routes to a fixed allowlist before logging.

This gives a field baseline for LCP/INP/CLS without introducing a third-party analytics SDK or a new cross-site identifier. Existing server request telemetry continues to provide API status and latency by endpoint.


## Phase 0 capture funnel

Universal Capture also emits a fixed, content-free funnel:

- `capture_opened`
- `capture_review_ready`
- `capture_committed`
- `capture_abandoned`
- `capture_corrected` with one fixed reason: description, amount, due day, direction, or source type

Allowed dimensions are limited to coarse input type, elapsed milliseconds, total item count, review item count, fixed correction reason and coarse route key. Values, descriptions, extracted text, filenames, evidence IDs, user IDs and Household IDs are not accepted by the client contract or logged by the endpoint.

This baseline is intended to answer: how long capture takes, where users leave, and how much review the machine creates. It is not intended to reconstruct what the user did financially.


## Time to First Value

For a Household created by the current session bootstrap, the client starts a local timer immediately before bootstrap and emits `first_value_observed` once the Home first contains useful financial information (a known account balance, movement, commitment, installment plan or imported invoice).

Only elapsed milliseconds and the coarse Home route are sent. Existing Households do not emit this event, preventing old accounts from distorting the first-use baseline. The event is intentionally one-shot per freshly created session.
