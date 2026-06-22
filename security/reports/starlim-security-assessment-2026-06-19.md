RESULTADO GLOBAL: BLOCKED

- Fecha: 2026-06-19
- Rama: security/hardening-2026-06-19
- Commit: 1e5d62aeadbaab4b9104c08f1faeb2746cc06664
- Entornos evaluados: local repo, produccion read-only
- Herramientas: Python audit runner, git, urllib/curl-style read-only checks, ASVS CSV oficial
- Limitaciones: sin deploy, sin migraciones, sin RLS, sin pruebas destructivas, E2E write bloqueado sin staging
- ASVS L2 aplicables registrados: 183
- ASVS L2 verificado: 1.09%
- PASS: 5
- FAIL: 0
- BLOCKED: 5
- WARNING: 1
- Produccion modificada: NO
- Secretos impresos: NO
- Pruebas destructivas: NO

## Findings

| ID | Severity | Status | Title |
| --- | --- | --- | --- |
| SEC-2026-002 | HIGH | WARNING | Repository has secret-like patterns requiring manual validation and possible rotation |
| SEC-2026-003 | MEDIUM | PATCHED_LOCALLY | Login now regenerates PHP session ID after successful authentication |
| SEC-2026-004 | MEDIUM | BLOCKED | Writable E2E testing blocked without staging/test tenant |
| SEC-2026-005 | MEDIUM | BLOCKED | Local Windows Vercel build is blocked by vercel-php path handling |

## Checks

| id | category | control | status | severity | component | evidence |
| --- | --- | --- | --- | --- | --- | --- |
| CHK-SESSION-001 | sessions | Local secure session cookie configuration | PASS | HIGH | api/php/auth.php | static review |
| CHK-SESSION-002 | sessions | Session ID regenerated on successful login | PASS | HIGH | api/php/login_usuario_be.php | static review |
| CHK-SESSION-003 | sessions | Central DB-backed session bootstrap covers entrypoints | PASS | HIGH | api/php/session_bootstrap.php | static review |
| CHK-ERROR-001 | errors | No DB exception detail returned to browser | PASS | HIGH | api/php/conexion_starlim_be.php | static review |
| CHK-AUTHZ-001 | authorization | Shared guard initializes session and denies anonymous users | PASS | HIGH | api/frontend/partials/guard.php | static review |
| CHK-PROD-AUTHZ-001 | production-readonly | Protected route anonymous access | BLOCKED | HIGH | /frontend/panel_empleados.php | https://star-lim-phi.vercel.app/frontend/panel_empleados.php |
| CHK-PROD-COOKIE-001 | production-readonly | Production Set-Cookie security attributes | BLOCKED | HIGH | /frontend/panel_empleados.php | https://star-lim-phi.vercel.app/frontend/panel_empleados.php |
| CHK-PROD-AUTHZ-002 | production-readonly | Protected route anonymous access | BLOCKED | HIGH | /frontend/admin_conciliacion_bancaria.php | https://star-lim-phi.vercel.app/frontend/admin_conciliacion_bancaria.php |
| CHK-PROD-COOKIE-002 | production-readonly | Production Set-Cookie security attributes | BLOCKED | HIGH | /frontend/admin_conciliacion_bancaria.php | https://star-lim-phi.vercel.app/frontend/admin_conciliacion_bancaria.php |
| CHK-SECRETS-001 | secrets | Secret pattern scan | WARNING | HIGH | repository | security/secret-scan-report.md |
| CHK-TOOLING-001 | tooling | PHP syntax lint availability | BLOCKED | MEDIUM | local tooling | PATH lookup |