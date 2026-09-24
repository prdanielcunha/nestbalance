# Roadmap field evidence runner

The engineering roadmap can prepare measurement, but it cannot manufacture moderated participants or production evidence. This runner turns real sessions into the exact aggregate gates without collecting financial content.

## Input

Copy `docs/research/field-evidence-template.json` to a local file that is **not** committed. Add sessions with:
- anonymous `participantOrdinal` plus cohort: individual, couple or family;
- device: phone or desktop;
- fixed flow code;
- duration, first-action time, step count, success, correction count;
- optional booleans for one-tap and Home comprehension;
- optional sync latency;
- fixed issue code and impact from 1–5.

Do not add balances, transaction values, descriptions, document text, filenames, Assistant questions, names, contact data or raw user/Household/account identifiers. The runner rejects sensitive field names before calculating anything.

## Run

`npm run roadmap:evidence -- /path/to/local-field-evidence.json`

Use `--require-gates` when you want a non-zero exit code until every measurable field gate passes:

`npm run roadmap:evidence -- /path/to/local-field-evidence.json --require-gates`

The report calculates participant mix, TTFV p50/p95, capture p50/p95, one-tap rate, correction rate, Home comprehension, priority-action timing, sync p50/p95 and the five highest frequency × impact frictions.

The empty committed template intentionally reports `evidence_incomplete`. It must never be used as evidence that research happened.
