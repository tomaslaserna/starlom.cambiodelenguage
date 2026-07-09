# Security Policy

Report vulnerabilities privately to the project owner/internal channel. Include affected URL/component, impact and sanitized reproduction. Do not run destructive tests, DoS, brute force, credential stuffing, persistence, secret exfiltration or real fiscal authorization. Critical issues are triaged immediately; high issues receive an owner and remediation plan. Coordinated disclosure only after validation, remediation and retest.

## Baseline

- No real secrets in Git. Use `apps/web/.env.local` locally and private Vercel/Supabase project settings in production.
- Data API exposure is opt-in only: grants and default privileges are revoked unless a migration explicitly opens a surface with RLS.
- Mutating HTTP requests must be same-origin or explicitly listed in `STARLIM_ALLOWED_ORIGINS`.
- Supabase Storage receipts live in a private bucket and are served through authenticated signed URLs.
- CI must run secret/config scanning, lint, tests, production dependency audit, build and CodeQL before merging security-sensitive changes.
- Production DB connections must use `starlim_app`, not `postgres`, `anon`, `authenticated` or `service_role`.
- JSON/form API bodies are capped by shared request parsing, while CSV and receipt uploads have explicit size/type checks.
