# NestBalance Release Readiness

## Environment model

- `main` publishes homologation.
- `production` publishes the public production environment.
- Homologation uses Cloud Run `nestbalance-api` and Hosting `mn-nestbalance-555464791734`.
- Production uses Cloud Run `nestbalance-api-prod` and Hosting `mn-nb-prod-555464791734`.

The Hosting configurations point to different Cloud Run services, so one environment cannot silently repoint the other.

## Mandatory gates

A release is accepted only after:

1. financial/core tests;
2. document and static security tests;
3. Firestore Rules emulator;
4. TypeScript typecheck;
5. exported Next.js build;
6. Cloud Run API build;
7. authenticated two-person household API flow against Firebase Auth + Firestore emulators;
8. Chromium mobile and desktop smoke;
9. serious/critical accessibility scan;
10. PWA service-worker cache privacy check (no `/api/**` entries);
11. local container health smoke;
12. public Hosting plus API smoke after deploy.

## Runtime observability

Health responses expose environment and Cloud Run revision/release identity. HTTP telemetry is structured and limited to request ID, method, path, status, duration, environment and release. Request bodies, evidence contents and financial values are intentionally excluded.

## Security baseline

Hosting has explicit anti-sniffing, referrer, framing, permissions, opener and HSTS headers. The API applies security headers plus bounded rate limits, with stricter limits on sensitive household and privacy actions.

The application rate limiter is defense in depth. Global abuse controls belong at the platform edge if traffic grows materially.

NestBalance session revocation is app-scoped so the product can invalidate its own sessions without revoking the shared MillionsNest Firebase session. Device visibility stores a protected random-device hash and coarse label, not precise location data.

## Production publication

The production workflow is allowed only from the `production` branch. It reruns code, Rules and browser gates before deployment, then smoke-tests the public Hosting-to-API rewrite.

Neither homologation nor production deploy standalone Firestore or Storage Rules over the shared MillionsNest Firebase project.

## Administrative controls outside repository scope

GitHub branch protection/rulesets, repository visibility, Firebase custom-domain ownership/DNS and GCP backup schedules require administrative control-plane permissions. They must be verified in their respective platforms and are not imitated in application code.

The intended custom domain is `nestbalance.millionsnest.com`. Until its Firebase Hosting binding is verified, the production `.web.app` hostname is the deployment authority.
