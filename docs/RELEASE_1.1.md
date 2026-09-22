# NestBalance 1.1 Stable Release

Source of truth: `NestBalance_Product_Blueprint_Master_v1.2` plus the 2026-09-22 release decision that unavailable future integrations must not be exposed in the product.

## Release identity

- Version: **1.1.0**
- Release date: **2026-09-22**
- Official domain: **https://nestbalance.millionsnest.com**
- Product principle for this release: show only what is usable now; future integrations remain invisible until intentionally activated and certified.

## What 1.1 changes

### Cofrinhos are a first-class financial area
- Cofrinhos sit in the primary navigation alongside Home, Movements, Accounts and Assistant.
- Screenshot-first import recognizes multiple savings pots, balances, goals and institution in one pass.
- Repeated screenshots update the same source instead of creating duplicates.
- The same named goal can be consolidated across institutions while keeping each source visible.
- Moving money into a user's own savings pot remains allocation/transfer semantics, not new spending.

### Documents become financial memory
- The former Vault surface is presented as **Documents**.
- Original files stay preserved and separate from interpretations.
- Search is framed around what the user remembers: amount, month, person, merchant or description.
- Empty states lead directly into Universal Capture instead of requiring the user to understand storage concepts first.

### Usable-only product surface
Open Finance remains outside the current product. Version 1.1 does not expose:
- bank-connection cards or calls to action;
- Open Finance terms or callback pages;
- Open Finance routes in the current NestBalance API;
- copy that implies bank synchronization is available now.

Dormant future provider/core code may remain in the repository for a later phase, but it is not reachable from the current product surface.

Legacy records previously created from a synchronized source do not become unusable: a normal balance edit converts the account into a manually maintained account and removes the old provider link fields.

## Premium UX/UI finish

The visual system keeps the established Night / Ink / Iris / Mint / Paper identity while improving long-term usability:

- translucent, sticky top bars with explicit Household access instead of an unexplained avatar-only control;
- clearer typography and visual hierarchy for financial numbers;
- responsive auto-fit grids instead of rigid desktop assumptions;
- action-oriented empty states;
- stronger focus-visible states and touch targets;
- subtle 160–260ms-feeling interactions with reduced-motion support preserved;
- separate light/dark surface treatment instead of simple color inversion;
- restrained gradients, depth and glass treatment so information stays readable;
- responsive bottom navigation designed around the five primary areas;
- first-use flows that offer either manual balance entry or Universal Capture;
- silent refresh on app focus for Accounts, Movements, Cofrinhos and Documents.

## Automation and ease-of-use

Version 1.1 keeps automation assistive rather than surprising:

- Universal Capture accepts text, screenshots/images, PDF/TXT/CSV and audio.
- Local/deterministic interpretation remains the first path when possible.
- Savings-pot screenshots can create/update several goals at once.
- Recurring-pattern suggestions require confirmation before creating a monthly obligation.
- Attention cards remain quiet and dismissible.
- Data screens refresh when the user returns to the app so newly captured information appears without a manual reload.
- Uncertain financial interpretation still requires review instead of silently inventing facts.

## Trust boundaries preserved

- Browser financial data access remains mediated by the NestBalance API.
- Direct browser Firestore/Storage financial access remains denied by the product security contract.
- Evidence originals remain immutable and linked to structured records.
- Personal vs Household scope remains enforced server-side.
- Transfer and credit-card settlement semantics continue to prevent expense double-counting.
- Privacy export/deletion and NestBalance-scoped session controls remain available.

## Certification required for publication

The release is publishable only after the same gates used by the stable product pass for the exact release SHA:

1. core and document tests;
2. static security invariants;
3. Firestore Rules emulator;
4. authenticated two-person API flow;
5. TypeScript typecheck;
6. web and Cloud Run builds;
7. Chromium mobile/desktop and accessibility checks;
8. PWA API cache-boundary checks;
9. homologation container/Hosting/API smoke;
10. production deployment and official-domain smoke.

The GitHub release tag must resolve to the same SHA certified by production deployment.
