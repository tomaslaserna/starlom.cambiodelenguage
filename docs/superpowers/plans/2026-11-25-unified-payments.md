# Approved scope: local unified payments and future treasury movements
No production deploy or data mutations. Existing records remain unchanged.
1. Share reconciliation eligibility between treasury balance and cash projection: movements created after reconciliation OR dated after statement date; no baseline includes all. Test before/on/after due date and subsequent statement absorption.
2. Add isolated supplier scheduling/payment core: integer cents, transaction locks, request idempotency, active company account, stale balance guard, closed-month guard, one payment + account entry + treasury outflow. Schedule has no cash effect. Preserve old requests, flag them for review instead of silently executing.
3. Reuse monthly cost/salary circuit and add supplier section in same Payments workspace. Replace Administration supplier scheduling form with link to workspace. No automatic historical backfill.
4. Add local-only additive schema/fixtures, integration tests, browser preview; build/lint. Present preview and deployment requirements before any publication.

## Local verification
- Treasury SQL test: pre-entered future amount remains projected, enters current balance on its date, is absorbed once by a later statement.
- Supplier integration tests: schedule creates no cash; partial/full payment and retries; cents; stale balance, foreign account, closed month, future payment rejection; actual scheduled CTE yields remaining debt once on selected date.
- 36 existing/new tests passed together, then additional projection test passed (3 supplier tests total). TypeScript, targeted ESLint and Next build passed.
- Browser localhost:3011: synthetic purchase 99,370.80; scheduled, paid 40,000.00; remaining and scheduled remainder 59,370.80; navigation to existing salary workspace verified.
- No production SQL, migration, payment, push, or deployment executed.
## Release prerequisites (not done)
Apply additive 20261125180000 migration after reviewing live schema/permissions. Enable UNIFIED_PAYMENTS_ENABLED only with that schema. Keep existing supplier requests visible/blocked for reconciliation; do not execute or delete them automatically. Existing historic purchases/payments are not backfilled. This preview does not add supplier-payment reversals or editing old schedules.
