# NestBalance 1.3 Premium Experience

Source of truth: NestBalance Product Blueprint v1.2 plus NestBalance Brand Kit Premium v1.0.

## Release identity

- Version: **1.3.0**
- Release date: **2026-09-24**
- Official domain: **https://nestbalance.millionsnest.com**
- Product rule: improve comprehension, speed and visual consistency without weakening the canonical financial model or human confirmation boundary.

## What changes

### Official brand system

The product now uses the Premium v1.0 identity as its UI foundation:

- Graphite #090B10 for the official dark canvas.
- #11151D and #181E28 for product surfaces.
- Pearl #F5F1E8 for primary dark-theme text.
- #98A0AE for secondary dark-theme text.
- Amber #FFB33E for primary action, selection, focus and financial emphasis.
- Orchid #9675FF only for intelligence, smart capture and automation contexts.
- Official full NestBalance lockup where space permits and the open-B symbol in compact navigation/PWA contexts.

The implementation deliberately avoids permanent glow, neon and broad glass effects. The light theme has an authored palette rather than being a mechanical inversion.

### Responsive shell

Authenticated routes share one navigation shell instead of rendering independent navigation instances.

- Mobile keeps a compact bottom navigation with 44px minimum interaction targets.
- Wide desktop uses a left sidebar.
- Desktop navigation can collapse to the open-B symbol and preserves the selected state.
- The collapsed preference is stored locally and does not change financial data.

### Pessoal, Lar and Tudo

The financial context selector is explicit and explained:

- **Pessoal**: only the user's private financial items.
- **Lar**: shared financial items for invited Household members.
- **Tudo**: combined view for the signed-in user.

The selected view persists across the primary financial routes. Server-side Personal/Household authorization remains unchanged.

### Decision-first Home

The Home continues to use canonical Home data and adds a clearer first-viewport decision model:

- current available balance;
- known commitments and due items;
- conservative “Você pode usar” amount;
- “Falta cobrir” when known commitments exceed available balances;
- quiet attention items and future projections already present in the product.

“Você pode usar” is an estimate derived from known available balances minus known commitments. It does not infer future income, hidden bills or unknown spending.

### PWA and browser identity

Version 1.3 includes branded:

- favicon;
- Apple Touch Icon;
- 192px and 512px install icons;
- maskable icons;
- Open Graph image;
- phone startup image;
- #090B10 browser/PWA theme color.

Universal Capture's existing Web Share Target remains preserved.

## Existing capabilities preserved

This release does not replace or mock existing product capabilities. The following continue using the existing canonical paths:

- Universal Capture for text, pasted screenshots/images, PDF/TXT/CSV, audio and Web Share Target;
- deterministic parsers before optional AI fallbacks;
- human confirmation when financial interpretation is uncertain;
- accounts, cards, statements, installments, recurring commitments and payments;
- categories and confirmed recurrence suggestions;
- Cofrinhos/goals and their existing automation semantics;
- Household roles, invitations, Personal/Household scopes and privacy controls;
- PT-BR, English and Español;
- Household revision refresh and focus refresh;
- explainable Assistant and contextual Documents/Vault.

## Safety boundaries

No release work may:

- enable paid integrations by default;
- weaken the server-mediated financial-data boundary;
- deploy standalone repository Firestore/Storage Rules over the shared MillionsNest project;
- bypass Personal-scope privacy;
- silently invent ambiguous financial facts;
- change card-payment semantics in a way that double counts expenses.

## Release gates

The exact release tree must pass:

1. dependency audit;
2. core, document and static-security tests;
3. Firestore Rules emulator;
4. authenticated two-person API emulator flow;
5. TypeScript typecheck;
6. exported web build;
7. Cloud Run API build;
8. Chromium browser quality on mobile and desktop;
9. serious/critical axe accessibility gate;
10. horizontal-overflow and minimum touch-target checks;
11. homologation deployment and public smoke;
12. production parity preflight, full production gates and container smoke;
13. production Cloud Run/Hosting deploy;
14. official-domain health, release-SHA and service-worker privacy checks.

Production is considered complete only after the official-domain workflow verifies the exact production SHA.
