RESULTADO GLOBAL: BLOCKED

- Fecha y hora: 2026-06-20T21:27:01.315841
- Rama: security/hardening-2026-06-19
- Commit: 1e5d62aeadbaab4b9104c08f1faeb2746cc06664
- Entorno: repo local + produccion solo lectura + Supabase/Postgres read-only.
- Herramientas usadas: Python audit runner, urllib HTTP sin redirects, pg8000, git, analisis estatico regex.
- Problema encontrado: no hay FAIL funcional activo en PHP/Supabase en la corrida actual; los bloqueos restantes son entorno/tooling, Vercel Firewall/Challenge y E2E sin staging.
- Causa raiz: el wrapper `.cmd` llamaba `python` directamente y Vercel mitigo requests automatizadas con Challenge; no se debe reportar eso como fallo de backend.
- Cambios aplicados: wrappers reproducibles y reportes de contrato backend/frontend.
- Pruebas PASS: 187
- Pruebas FAIL: 0
- Pruebas BLOCKED: 12
- Pruebas WARNING: 1
- Endpoints revisados: 91
- Pantallas revisadas: 48
- Produccion modificada: NO.
- Deploy ejecutado: NO.
- Secretos impresos: NO.
- Operaciones destructivas: NO.

## Fallos/Bloqueos
| ID | Severidad | Capa | Modulo | Archivo | Linea | Problema | Causa raiz | Correccion | Estado | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STATIC-0001 | BAJA | static | php | all php files |  | php -l syntax | php executable not found in PATH | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | STATIC-0001 |
| SEC-0122 | alta | static | secrets | repository |  | secret pattern scan | 5 files flagged: ['.env.example', '.env.smoke.example', 'api/facturacion/src/afip.php-master/src/Afip.php', 'api/php/storage_supabase.php', 'reports/starlim-inventory.json'] | Ver fixes-applied o desbloquear entorno/herramienta. | WARNING | SEC-0122 |
| PROD-0189 | BAJA | production-readonly | http | / |  | GET route smoke | status=403; location=; php_error=False; vercel_mitigated=True | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | PROD-0189 |
| PROD-0190 | BAJA | production-readonly | http | /frontend/index.php |  | GET route smoke | status=403; location=; php_error=False; vercel_mitigated=True | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | PROD-0190 |
| PROD-0191 | BAJA | production-readonly | http | /frontend/sign.php |  | GET route smoke | status=403; location=; php_error=False; vercel_mitigated=True | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | PROD-0191 |
| PROD-0192 | BAJA | production-readonly | http | /frontend/panel_empleados.php |  | GET route smoke | status=403; location=; php_error=False; vercel_mitigated=True | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | PROD-0192 |
| PROD-0193 | BAJA | production-readonly | http | /frontend/admin_conciliacion_bancaria.php |  | GET route smoke | status=403; location=; php_error=False; vercel_mitigated=True | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | PROD-0193 |
| E2E-0195 | BAJA | e2e/business | safe-write-flows | Admin login E2E |  | safe write flow gate | No non-production writable environment or test credentials were provided; production is read-only by prompt. | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | E2E-0195 |
| E2E-0196 | BAJA | e2e/business | safe-write-flows | Limited user E2E |  | safe write flow gate | No non-production writable environment or test credentials were provided; production is read-only by prompt. | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | E2E-0196 |
| E2E-0197 | BAJA | e2e/business | safe-write-flows | Cliente-presupuesto-venta-entrega-cobro |  | safe write flow gate | No non-production writable environment or test credentials were provided; production is read-only by prompt. | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | E2E-0197 |
| E2E-0198 | BAJA | e2e/business | safe-write-flows | Compra-stock-pago |  | safe write flow gate | No non-production writable environment or test credentials were provided; production is read-only by prompt. | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | E2E-0198 |
| E2E-0199 | BAJA | e2e/business | safe-write-flows | Conciliacion bancaria write flow |  | safe write flow gate | No non-production writable environment or test credentials were provided; production is read-only by prompt. | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | E2E-0199 |
| E2E-0200 | BAJA | e2e/business | safe-write-flows | Facturacion fiscal authorization |  | safe write flow gate | No non-production writable environment or test credentials were provided; production is read-only by prompt. | Ver fixes-applied o desbloquear entorno/herramienta. | BLOCKED | E2E-0200 |

## Comando para repetir
```powershell
scripts\starlim-test-all.ps1
```
