# NestBalance Runtime Readiness

NestBalance uses the official MillionsNest Firebase/GCP project:

- Firebase/GCP project: `millionsnest`
- project number: `555464791734`
- Cloud Run region: `us-central1`
- private evidence bucket: `millionsnest.firebasestorage.app`
- dedicated Hosting site: `mn-nestbalance-555464791734`
- deploy identity: `mn-web-deployer@millionsnest.iam.gserviceaccount.com`
- runtime identity: `nestbalance-runtime@millionsnest.iam.gserviceaccount.com`

The Firebase Web configuration is public application configuration and is shared with the existing MillionsNest Hub. Secrets remain server-side.

## Browser boundary

The browser uses Firebase only for Authentication.

Household bootstrap, Home data, accounts, financial commits, evidence metadata, uploads, document analysis, AI analysis and Vault access are mediated by `nestbalance-api`.

Evidence bytes are uploaded to the API. The backend validates household membership, declared size, MIME, file signature and SHA-256 before the object becomes an accepted immutable evidence asset.

## Shared Firebase safety

The `millionsnest` project is shared by the ecosystem.

This repository MUST NOT deploy its standalone `firestore.rules` or `storage.rules` over the shared project. Those local rules are deny-by-default contracts used by the Emulator security suite to prove that the browser does not depend on direct financial-data access.

The homologation workflow intentionally deploys only:

- Cloud Run service `nestbalance-api`
- dedicated Firebase Hosting site `mn-nestbalance-555464791734`

## Automatic homologation

Every certified push to `main` runs **Deploy NestBalance Homologation**.

The workflow:

1. runs the complete test, security, Rules Emulator, typecheck and build gates;
2. authenticates to the official MillionsNest GCP project through Workload Identity Federation;
3. ensures the dedicated `nestbalance-runtime` service account exists;
4. applies only the minimum Firestore/Storage runtime permissions required by the API;
5. deploys `nestbalance-api` to Cloud Run with bounded scale;
6. ensures the dedicated Firebase Hosting site exists;
7. preserves existing Firebase Auth authorized domains and adds the NestBalance `.web.app` host only when necessary;
8. deploys Hosting only — never standalone Firestore or Storage Rules;
9. smoke-tests Cloud Run and the hosted NestBalance page.

A manual `workflow_dispatch` remains available for an explicit redeploy of `main`.

## AI and zero-cost fallback

Deterministic parsers remain the first path. Images can be read locally in the browser, and the protected Gemini Free fallback receives only sanitized OCR text after explicit product gating; the original image is not sent through that fallback. Paid/provider-backed AI remains optional at deployment time.

When `OPENAI_SECRET_NAME` is configured, the runtime service account receives Secret Manager accessor only for that secret and Cloud Run receives it as `OPENAI_API_KEY`. Without paid AI, deterministic text/PDF parsing, local image OCR, accounts, Home, commitments, Vault and the rest of the core product continue to work. Any unavailable intelligence path fails closed with review/manual entry instead of inventing financial facts or silently creating a charge.

## Browser PWA privacy boundary

The service worker may cache only the exported application shell and same-origin static assets. Requests under `/api/**` are always network-only and are never written to Cache Storage. Evidence previews, financial responses, account data, assistant answers and other private API payloads therefore remain outside the offline cache.

`sw.js` is served with `no-cache, no-store, must-revalidate` so a security update is not pinned behind a stale service worker.

## NestBalance-only session security

Recent-device visibility uses a random browser-generated device id. The backend stores only a SHA-256-derived document id plus a coarse device label and timestamps; it does not store location or an IP fingerprint for this feature.

The “end all NestBalance sessions” control uses an app-scoped revocation timestamp checked by the NestBalance API. It deliberately does not call global Firebase refresh-token revocation because Authentication is shared by the MillionsNest ecosystem. Other MillionsNest products are not signed out by this NestBalance control.

## Expected homologation URL

`https://mn-nestbalance-555464791734.web.app`

The workflow smoke test is the deployment authority: the URL is considered ready only after Hosting and `/healthz` both pass.
