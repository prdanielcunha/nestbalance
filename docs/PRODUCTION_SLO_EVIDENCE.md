# Production SLO evidence

Phase 7 engineering gates can prove builds, bundle budgets, emulator behavior and browser accessibility, but production SLOs need aggregate field measurements from the exact promoted SHA.

Copy `docs/ops/slo-evidence-template.json` to a local, uncommitted file and populate only aggregate metrics:
- `lcpP75Ms`
- `inpP75Ms`
- `clsP75`
- `apiErrorRate` as a fraction
- `bundleRegressionMaxPct`
- `syncP95Ms`
- `apiAvailability` as a fraction
- `crashFreeRate` as a fraction

Also record the exact 40-character release SHA and the measurement window. Never place prompts, OCR, descriptions, balances, amounts, files or raw user/Household identifiers in this evidence file.

Run:

`npm run roadmap:slo -- /path/to/slo-evidence.json`

Use `--require-gates` to fail until all thresholds are satisfied. The committed template is intentionally incomplete and is not production evidence.
