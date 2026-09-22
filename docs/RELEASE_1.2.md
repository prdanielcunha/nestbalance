# NestBalance 1.2.2 Real-Life Hardening

Source of truth: NestBalance product blueprint plus the 2026-09-22 Cofrinhos product decision.

## Release identity

- Version: **1.2.2**
- Release date: **2026-09-22**
- Official domain: **https://nestbalance.millionsnest.com**
- Product rule: expose only capabilities that are usable now. Future bank integrations remain outside the executable user surface.

## 1.2.2 real-life hardening

This patch keeps the same product scope and raises the fail-safe bar for messy real-world financial inputs:

- invalid calendar dates such as `2026-02-31` are rejected instead of being silently normalized;
- pasted dates/times are no longer mistaken for monetary amounts in text capture;
- Brazilian thousands such as `R$ 1.250` and OCR-spaced values such as `R$ 1 250,50` are preserved correctly;
- card-statement refunds, credits and reversals require human review instead of becoming a new expense;
- savings-pot OCR accepts thousands separated by spaces while keeping cross-bank goal conflicts explicit;
- card cycles and installment schedules are regression-tested across month-end and leap-year boundaries.

## 1.2.1 hardening

This patch does not add product scope. It raises the release bar around the financial state users already depend on:

- authenticated payment matching is exercised against the Firebase Auth + Firestore emulator flow;
- marking a recurring commitment as paid must persist into Home and disappear from the Assistant's remaining-to-pay sources;
- undo must restore the commitment and remove the generated payment transaction;
- month rollover is protected so an older payment cannot be reversed while a later payment still exists;
- both production Hosting paths must publish the exact same Git tree as certified `main`, preventing production-only code from reaching users.

## Cofrinhos 2.0

Version 1.2 turns Cofrinhos into first-class savings goals that can start in either of two ways:

1. **Import a screenshot** from a bank/wallet screen and let NestBalance recognize several pots at once.
2. **Create manually** inside NestBalance with a name, optional private photo, initial amount, target value, deadline, source and note.

### Goal experience

Each pot can show:

- current tracked balance;
- target value;
- progress percentage;
- remaining value;
- optional target date;
- suggested monthly and weekly pace toward a dated goal;
- a private cover photo with initials fallback;
- source/institution and Personal vs Household scope;
- activity history.

The same normalized goal name can be consolidated across institutions without double-counting the target. Each underlying source remains individually accessible.

### Reserve and withdraw

Manual NestBalance pots support explicit **Reserve** and **Withdraw** actions. These update the user's NestBalance organization and append auditable activity records.

These controls do **not** send orders to a bank. NestBalance does not classify movement between the user's own funds as new income or spending.

Imported bank pots use a bank-mirror mode: later screenshots refresh their real-world balance without duplicating the pot. NestBalance does not create synthetic bank movements for imported pots.

### Assistive automations

For manually tracked pots, users can enable:

- daily reserve;
- weekly reserve;
- reserve every 15 days;
- monthly reserve;
- fixed amount or percentage when a known expense is recorded;
- fixed amount or percentage when known income is recorded;
- expense round-up to the next whole real.

Automation events are idempotent and scoped to the same Personal/Household boundary as the pot. Scheduled rules begin on the next cadence instead of creating an immediate surprise contribution. Long-running schedules keep advancing rather than becoming stuck on their earliest occurrences.

Automations are organizational records inside NestBalance. They do not initiate bank transfers.

## Screenshot intelligence

The savings-pot screenshot reader supports:

- pot name;
- current balance;
- visible target value;
- explicit target/deadline dates with a proven four-digit year;
- institution recognition;
- repeated-import deduplication;
- preservation of manually enriched metadata when a later screenshot omits it;
- a screen-sync activity trail when the imported balance changes.

Uncertain values continue through human review rather than being silently invented.

## Photos and privacy

Cofrinho cover images:

- accept JPEG, PNG and WebP up to 5 MB;
- are uploaded through the authenticated API;
- are validated against their file signature;
- are stored under the private NestBalance household prefix;
- are previewed only through an authenticated, scope-checked API response;
- are served with private/no-store caching;
- are removed during Personal data deletion when owned personally;
- are removed with the household storage prefix when the Household is deleted;
- never expose the private Storage path in privacy exports.

Cofrinho activity and automation event records are included in privacy export/deletion coverage.

## Product boundary

NestBalance intentionally does not imitate financial-custody features it cannot actually execute. Version 1.2 therefore does not claim to:

- move money at a bank from a Cofrinho button;
- generate or guarantee yield;
- pay merchants directly from a Cofrinho;
- expose unavailable Open Finance controls.

The product records, organizes, reconciles and explains the user's financial reality without pretending to be the bank.

## UX/UI

The 1.2 Cofrinhos experience includes:

- photo-forward premium cards;
- concise source and privacy labels;
- high-contrast balance hierarchy;
- native progress bars;
- goal/deadline guidance;
- responsive create/edit and detail sheets;
- dedicated reserve/withdraw flow;
- understandable automation configuration;
- activity timeline;
- mobile-first layouts down to narrow phone widths;
- light/dark treatment consistent with NestBalance 1.1;
- clear explanations at the exact point where a bank-vs-NestBalance distinction matters.

## Certification requirements

This release is accepted only after the exact release SHA passes:

1. core savings-goal/automation/parser tests;
2. document and static security gates;
3. Firestore Rules emulator;
4. authenticated two-person API flow;
5. TypeScript typecheck;
6. web and Cloud Run builds;
7. Chromium mobile/desktop and accessibility checks;
8. PWA API cache-boundary checks;
9. homologation deployment and public smoke;
10. production deployment and official-domain smoke;
11. GitHub release/tag verification against the certified production SHA.
