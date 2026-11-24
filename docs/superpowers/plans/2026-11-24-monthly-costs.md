# Monthly cost preservation implementation plan

Goal: working local demonstration of month snapshots and effective-month changes; no production writes or deployment.
Spec: user-approved continuation of outputs/costos-sueldos-2026-11-24/Auditoria-y-propuesta.md.
Architecture: pure versioned cost model with integer cents, immutable saved month snapshots and append-only edit log. Development-only Next preview persists synthetic demo data in localStorage. It does not query or mutate ERP data. Database adapter and production integration remain for later review.
Tech: TypeScript, React, Next development route, node:test.

Decisions: saved months are locked; adjustments may start only after the latest saved month. Existing future versions remain unless explicitly replaced by an edit at that same effective month. Indefinite expenses require a monthly include/suspend decision. Salary recurs; finite expense expiry belongs to original schedule, not each price edit. No silent restoration/reset on invalid storage. No backend migration in this stage.

- [x] Write failing tests for edits, saving, immutability, persistence validation, inactive versions, finite schedules, pending confirmations, rounding and duplicate save.
- [x] Implement model in src/lib/monthly-costs.ts.
- [x] Add local preview /preview/costs with month selector, saved/draft status, confirmation, effective edit and comparison across months; label persistence scope.
- [x] Run tests, tsc/lint; browser save/edit/reload and historical protection; document limits and leave preview open.

Review focus: no reference aliasing into saved months; no old-month mutation through confirmations; reject malformed months/amounts; no repeated salary provision rounding; expired costs cannot be resurrected by confirmation; local storage failure must not claim saved success.
