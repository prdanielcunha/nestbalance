# NestBalance — Phase 0 Visual & Interaction Inventory

This inventory is the engineering companion to the senior evaluation roadmap. It records the current product surfaces that must be checked during moderated research and release QA without collecting financial content.

## Critical product surfaces

| Surface | Primary job | Critical states to inspect |
| --- | --- | --- |
| Home `/` | Understand money available now, commitments and projected remainder; act on up to three priorities | loading, empty/first value, partial/uncertain data, populated, offline/sync, permission |
| Capture `/add` | Add text, screenshot/photo, file or audio with exception-only review | input, receiving, reading, understanding, comparing, review-ready, error, offline queue, duplicate, undo |
| Movements `/movements` | Review recent financial activity and evidence context | loading, empty, filters, Personal/Household scope, read-only |
| Accounts `/accounts` | Manage balances, cards and invoice flows | empty onboarding, populated, account/card editor, import/review, conflict, read-only |
| Savings Pots `/pots` | Organize goals without pretending money moved at the bank | empty, active goals, manual/bank-mirror tracking, imported pots, read-only |
| Assistant `/assistant` | Ask financial questions and use explainable planning/intelligence | starters, answer, explainable insight, scenario, saved scenario, preferences, monthly close |
| Inbox `/inbox` | Resolve exceptions before inspecting already-finished work | needs-you, in-progress, resolved, offline pending |
| Household `/household` | Manage people, roles, preferences and Household identity | loading, owner/admin/member/read-only, invitation, pending invite, error |
| Household Center `/together` | Coordinate shared tasks, comments, expense splits and weekly check-in | loading, no tasks, active tasks, comments, split open/settled, read-only |
| Documents/Vault `/documents`, `/vault` | Find old proof and inspect original evidence safely | loading, empty, search result, no result, preview unavailable |
| Privacy `/privacy` | Understand Household vs Personal, export/delete/control own data | loading, permission, export, deletion safeguards |
| Support `/support` | Self-diagnose runtime/capabilities and export/share a report | diagnostics, export, report link, beta opt-in |
| Public trust/plans | Explain data, AI and commercial posture before sign-in | security/privacy/AI explanation, plans, no Open Finance promise |

## Responsive matrix

Every release-critical flow is inspected at:

- 320 x 720
- 390 x 844
- 768 x 1024
- 1024 x 900
- 1440 x 1000
- 1920 x 1080

The browser gate must reject horizontal overflow on the authenticated shell. Mobile keeps the fixed bottom navigation; desktop uses the inline navigation contract.

## Theme and accessibility matrix

For critical screens, verify both light and dark themes where the surface supports them. Functional controls must stay keyboard reachable, retain visible focus, meet the control-size contract and avoid relying on color alone. Automated axe checks reject serious and critical violations; manual research still covers comprehension, zoom/text scaling and assistive-technology behavior.

## Content hierarchy checks

The evaluation specifically asks for a fast answer to “what matters now.” During review, verify:

1. Home leads with available money, remaining commitments and projected remainder.
2. Unknown or partial information is shown as uncertain instead of silently treated as zero.
3. The priority area remains short and action-oriented.
4. Capture asks for human input only when confidence is insufficient.
5. Financial values use tabular numerals and do not jump visually as they change.
6. Supporting metadata stays subordinate to primary actions; control text never drops below the functional typography floor.
7. Household and Personal scope are explained before actions that could expose shared information.

## Privacy inspection

Visual QA and analytics QA are separate. Screens may display financial data to the authorized user, but product telemetry must never include balances, amounts, descriptions, uploaded text, filenames, Assistant questions, evidence IDs, Household IDs or user IDs. Capture correction telemetry is limited to a fixed reason enum.

## Research evidence to add after sessions

The engineering repository intentionally does not invent human-study results. After the required 5 individual, 5 couple and 3 family sessions, record only aggregate outcomes here or in the research report:

- task success and first-action time;
- duration and number of actions;
- review abandonment/corrections;
- comprehension of Household vs Personal;
- the five highest-frequency x impact frictions.

Do not store participants' real financial values or document content in this repository.
