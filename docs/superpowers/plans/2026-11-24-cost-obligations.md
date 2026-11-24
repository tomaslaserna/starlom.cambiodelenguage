# Cost obligations implementation plan

**Goal:** Local review of monthly expense -> obligation -> one treasury outflow, approved in chat. No production writes or deployment.
**Architecture:** Explicit obligation per company/cost/month, immutable source amount; payment allocation references one unique treasury movement. Transactions lock the obligation and serialize idempotency keys. Shared SQL service runs against local PGlite and production PostgreSQL adapter (disabled until release).
**Scope:** Expenses only; payroll and provisions retain their existing circuit. No automatic historical backfill. Existing manual outflows may be linked in full, without writing or changing treasury. No automatic payments from creating costs.
**Plan:**
- [x] PostgreSQL migration + failing integration tests: duplicate create/pay, partial, overpay, foreign account, inactive account, rollback, legacy unchanged, existing movement reuse.
- [x] Implement transaction service, company scoping, immutable payment links and state readers.
- [x] Authenticated routes and feature-gated integration into obligations and projection; local demo isolated from ERP.
- [x] UI: costs to schedule; obligations table; choose account/date/amount; explicit confirmation; history.
- [x] Run tests/build/browser partial payment + reload. Keep test data local and show preview without publishing.
**Review focus:** stale requests, retry after network loss, mismatched account, double source month, historical date, existing outflow linked twice.

## Verification 2026-11-24
- 40 Node tests passed, including 6 PostgreSQL-compatible integration tests.
- TypeScript and targeted ESLint passed; production Next build passed.
- Browser at localhost:3010/preview/cost-obligations: created 800000 ARS rent, paid 300000 ARS from Santander demo, reloaded, confirmed 500000 ARS pending and exactly one new movement (#11).
- Production feature flag COST_OBLIGATIONS_ENABLED remains unset. Migration exists locally only; no production data was accessed or changed in this implementation turn.
- Local sample database apps/web/.local/cost-obligations-pg is excluded from git and deployment.
- Scope: expense obligations, not payroll settlement. Existing manual outflows can only be linked in full once. Planned obligations freeze their source amount for that month; later-month edits remain allowed. No automated reconstruction of historical payments.
