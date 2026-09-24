# NestBalance — Technology Decisions for the Evaluation Roadmap

Date: 2026-09-24

These decisions are implementation guidance, not permission to skip roadmap gates. Expensive or infrastructure-changing items stay feature-flagged until their phase reaches implementation.

## 1. Web/PWA foundation — KEEP

Keep Next.js + TypeScript + React and the installable PWA as the primary surface.

Why:
- the product is already shipping on this stack;
- current problems are UX consistency, observability, realtime latency and component boundaries, not a framework limitation;
- a native rewrite would delay the six product demonstrations without improving financial integrity.

Rule: only revisit a native wrapper when a proven device capability cannot be delivered reliably by the PWA.

## 2. UI architecture — EVOLVE, DO NOT REWRITE

Adopt one shared AppShell, then split styling into layers:

1. tokens;
2. primitives;
3. shared patterns/layouts;
4. feature styles.

Keep the current CSS approach during migration. Do not introduce Tailwind or a component framework just to replace working styles. Premium quality comes from hierarchy, typography, motion, density and consistency, not from a CSS vendor.

State-heavy features should move business state out of visual components. Start with TypeScript discriminated unions/reducers and pure functions. Add XState only if parallel/interruptible workflows become hard to prove with the lighter approach.

## 3. Realtime invalidation — PREFERRED: DEDICATED FIREBASE RTDB PLANE

Do not stream financial records.

Preferred Phase 2 design:
- authenticated API remains the only financial authority;
- backend writes tiny per-user invalidation records to a dedicated NestBalance Realtime Database instance;
- client may read only its own `/users/{uid}/revisions/*` path;
- payload contains only monotonic revision, changed domains and timestamp;
- client refetches the affected domain from the authenticated API;
- existing 25-second polling remains a backoff/failure fallback.

Why RTDB over a permanent Cloud Run socket:
- Cloud Run long-lived streams consume active instances and must reconnect at request timeout;
- RTDB is purpose-built for tiny realtime fanout and has a generous low-volume cost envelope;
- a per-user invalidation path avoids teaching RTDB rules the financial Household model;
- removal from a Household stops future invalidations without exposing financial content.

Spike requirement before adoption: two devices, member removal, reconnect, multi-tab, offline return, p95 invalidation latency and monthly downloaded bytes.

Alternative: authenticated SSE/fetch-stream on Cloud Run if the RTDB spike fails security or operational criteria. Do not select WebSocket just for bidirectionality; the client does not need to publish financial state over the realtime channel.

## 4. Offline writes — INDEXEDDB + IDEMPOTENCY

Phase 2 offline queue should hold commands, not authoritative balances.

- generate a client command/idempotency key;
- store the minimal pending command in IndexedDB;
- show explicit pending/synced/conflict UI;
- replay on reconnect;
- server remains responsible for authorization and idempotency;
- conflicts never silently overwrite a newer financial fact.

Prefer a very small IndexedDB helper such as `idb` when implementation begins; do not add a full offline database framework.

## 5. Document intelligence — LOCAL FIRST

Keep the current direction:

1. deterministic parsers;
2. native PDF/text extraction;
3. reusable local OCR worker for images where practical;
4. domain-specific normalization/dedup/matching;
5. low-cost model on minimized/redacted text;
6. paid multimodal model only for unresolved cases;
7. human review for ambiguity.

Reuse OCR workers and lazy-load them. Never reprocess the same evidence/model version when a cached structured result exists.

For PDFs, preserve original bytes and extract native text before rasterizing pages. Raster/OCR only pages that need it.

## 6. AI provider strategy — PROVIDER GATEWAY, NOT MODEL LOCK-IN

Create a small internal provider interface before expanding model usage:

- schema/version;
- capability (text, vision, audio);
- sensitivity lane;
- timeout;
- budget class;
- model/provider version;
- structured output validation;
- normalized confidence/error response.

Selection is benchmark-driven on an anonymized/synthetic NestBalance evaluation set.

Data lanes:
- **local/deterministic**: default;
- **free provider tier**: only explicitly allowed, minimized/redacted content where provider terms are acceptable;
- **paid/private provider lane**: sensitive production workload when local processing is insufficient;
- **manual fallback**: always available.

Do not log prompts, OCR text, values, names or images. Log provider/model version, latency, token/usage counters and coarse outcome only.

## 7. Background processing — CLOUD TASKS WHEN NEEDED

For one-document-one-job work that requires retry/backoff, prefer Cloud Tasks over adding a general event bus prematurely.

Good candidates:
- heavy OCR/vision fallback;
- invoice parsing that exceeds the interactive request budget;
- selective reprocessing after parser/model version changes.

Every task must be idempotent by evidence hash + processor version.

Use Pub/Sub only when there is a real fanout/event-stream requirement across multiple consumers.

## 8. Analytics/observability — FIRST PARTY AND REDACTED

Current server request telemetry stays.

Add:
- Next.js Web Vitals;
- fixed product-funnel event names;
- structured import stage durations;
- coarse outcome/error codes;
- release/environment identity.

Do not add GA/Amplitude/Mixpanel/PostHog in the baseline merely to get dashboards. A future analytics SDK requires an explicit privacy review.

Phase 7 can add OpenTelemetry/Cloud Trace when distributed traces become necessary. Until then, request IDs + structured stage logs are cheaper and easier to audit.

## 9. Search — DETERMINISTIC BEFORE VECTOR DATABASE

Universal search should first unify existing structured search across movements, commitments, accounts, savings pots and evidence metadata.

Semantic/embedding search is justified only for evidence language that deterministic normalization cannot solve. If added:
- embed minimized derived text, never original files by default;
- version embeddings;
- maintain a non-AI search fallback;
- do not add a separate vector SaaS before scale/quality proves it necessary.

## 10. Testing — EXTEND THE EXISTING STACK

Keep Playwright + axe + current domain/security tests.

Add incrementally:
- complete route/viewport/theme matrix;
- screenshot baselines for critical routes;
- two-session concurrency test;
- offline/reconnect/idempotency scenarios;
- capture fixtures for OCR/parser regressions;
- bundle budgets and Web Vitals regression guards.

Do not add Cypress or another overlapping browser suite.

## 11. Performance — LAZY HEAVY CAPABILITIES

- keep OCR outside initial route bundles;
- lazy-load capture editors and heavy document helpers;
- reuse workers;
- cancel stale requests on Household/view changes;
- define route bundle budgets before Phase 7 closes.

## 12. Commercial/Open Finance boundary — KEEP CLOSED

Open Finance stays outside the executable product surface until Phase 8 gate:
- provider contract and variable cost known;
- consent/revocation tested end to end;
- reconciliation does not duplicate manual/imported truth;
- support can operate without raw financial content.

Do not make bank connectivity a dependency for the core NestBalance value proposition.
