# NestBalance 1.0 Stable Release

Source of truth: `NestBalance_Product_Blueprint_Master_v1.1` (September 2026).

## Release identity

- Version: **1.0.0**
- Stable release date: **2026-09-22**
- Official domain: **https://nestbalance.millionsnest.com**
- Certified release candidate production SHA: `da0c8997920526d861d38c28ce684c184319bf5d`
- Stable release preserves the same MVP product scope and promotes the fully certified RC without enabling paid integrations.

## Production certification inherited from 1.0.0-rc.1

The release candidate was deployed to production and the production branch passed:

- NestBalance CI run **#1066**
- NestBalance Browser Quality run **#144**
- Deploy NestBalance Production run **#8**
- Publish NestBalance Official Production Site run **#7**

The deployment workflow also passed production preflight, the complete application gates, Browser release gate, production container smoke, Cloud Run deployment, Firebase Hosting deployment, Auth-domain authorization and public production smoke. The official-site workflow verified the production health endpoint, production environment identity, public page, service-worker API cache boundary and `no-store` delivery.

## Blueprint closure

Phases 0–5 are complete for the initial MVP:

- Foundation: authentication, Household, navigation, i18n, observability and security boundary.
- Financial core: accounts, balances, movements, recurring commitments, cards, Home/month state and payments.
- Universal input: text, image/screenshot, PDF/TXT/CSV and audio converge on a human review layer.
- Statements/installments: review, future installment projection, deduplication and statement settlement without purchase double counting.
- Assistant/forecast: source-linked answers, future projections, simulations, spending change and anomaly/duplicate signals.
- Advanced family: separate credentials, roles, invitation-first onboarding, Personal vs Household scopes, authorship/activity and privacy rights.

All five mandatory blueprint demo moments are protected by the product/release test suite.

## Stable boundaries

These remain deliberate product boundaries, not unfinished MVP features:

- Open Finance paid-provider activation is outside the initial MVP and remains fail-closed by default.
- Device push is optional; the stable baseline is quiet in-app attention controlled by per-member preferences.
- Legal trademark clearance, provider contracts, GCP backup policy and repository administration live outside application code and require the relevant account/legal control plane.
- The PWA remains the primary surface; a native wrapper is not required for 1.0.

## Stable decision

NestBalance **1.0.0** is the stable initial release. Further product work should use semantic versioning and must not silently broaden the frozen MVP scope, enable paid providers, weaken Personal-scope privacy, or bypass human confirmation on uncertain financial interpretation.
