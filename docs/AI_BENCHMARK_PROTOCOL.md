# NestBalance AI benchmark protocol

This benchmark is a release guard, not a claim that a provider is clinically or financially “accurate”.

## Data policy

Only synthetic or properly anonymized cases may enter `tests/fixtures/ai-benchmark-cases.json`. Do not place names, raw financial documents, account identifiers, Pix keys, card numbers, prompts copied from users, or household/user IDs in the repository.

The committed dataset is intentionally synthetic. Real-world cases may be added only after anonymization and review.

## Local continuous gate

`npm run benchmark:ai` measures deterministic parser expectations and privacy redaction. CI fails below 95% expected parser fields or below 100% privacy checks. The benchmark runs after the core TypeScript build and does not call an external model.

## Provider/model evaluation

A model/provider candidate must be evaluated separately before routing production traffic. Record only aggregate results for:
- schema validity;
- extraction precision by task;
- review/correction rate;
- p50/p95 latency;
- unit/currency cost;
- provider data policy and retention;
- fallback behavior.

Never commit raw provider inputs or outputs when they contain financial content. Provider/task/prompt rollout is controlled by the AI Gateway feature flags. The production Gateway records model, prompt version, task, coarse unit count, status and duration without prompts or financial values.

A model change is not promoted merely because it is cheaper. It must satisfy the task-specific quality threshold and privacy policy first.
