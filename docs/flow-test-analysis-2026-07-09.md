# Analisis de tests por flujo - Star_lim

Fecha: 2026-07-09
Repo: `C:\Users\tomil\Desktop\Star_lim (1)\Star_lim`
App evaluada: `apps/web`
Base de flujo usada: `docs/project-flow.md`

## 1. Objetivo

Validar dos veces la estabilidad tecnica del proyecto y empezar a medir los
flujos del diagrama como una matriz de pruebas repetible.

La validacion cubrio:

- Variables de entorno requeridas.
- Escaneo de secretos y patrones inseguros versionables.
- Tests estaticos/invariantes del ERP.
- Lint.
- Build productivo de Next.js.
- Smoke HTTP contra `http://localhost:3400`.
- Contratos y latencias de endpoints asociados a los flujos del diagrama.

## 2. Cambios hechos para poder testear por flujo

Se agrego cobertura nueva antes de ejecutar la bateria:

- `apps/web/scripts/smoke.mjs`
  - Carga `.env.smoke` desde la raiz del repo y desde `apps/web`.
  - Envia `Origin` en metodos mutantes para simular requests same-origin reales y atravesar el CSRF del proxy.
  - Mide latencia por endpoint.
  - Agrega matriz de smoke para los flujos documentados.
  - Presupuestos configurables:
    - `STARLIM_SMOKE_MAX_LATENCY_MS`, default `5000`.
    - `STARLIM_SMOKE_HEAVY_MAX_LATENCY_MS`, default `8000`.

- `apps/web/scripts/static.test.mjs`
  - Agrega un test para que `docs/project-flow.md` siga alineado con libs, tablas y endpoints reales.

- `docs/project-flow.md`
  - Ajustado para incluir `messages` como libreria de dominio, porque el guardrail detecto que el documento no nombraba esa pieza de codigo.

## 3. Ambiente de ejecucion

El smoke usa `STARLIM_SMOKE_BASE_URL`, que en este entorno apunta a:

```text
http://localhost:3400
```

El servidor local no estaba corriendo al iniciar. Se levanto Next.js en el puerto `3400`.

Primer intento de health:

```text
503 self-signed certificate in certificate chain
```

Para poder probar localmente contra Supabase se reinicio el proceso de Next con:

```text
SUPABASE_DB_SSL_REJECT_UNAUTHORIZED=false
```

Ese cambio fue solo del proceso local de smoke. No se guardo ningun secreto ni se modifico `.env.local`.

Health despues del ajuste:

```text
200 OK
database.ok = true
source = SUPABASE_DB
```

## 4. Bateria ejecutada dos veces

Comandos ejecutados en cada vuelta desde `apps/web`:

```bash
npm run env:check
npm run security:scan
npm test
npm run lint
npm run build
npm run test:smoke
```

## 5. Resultado consolidado

| Prueba | Vuelta 1 | Vuelta 2 | Lectura |
| --- | ---: | ---: | --- |
| `env:check` | Pasa, 0.70s | Pasa, 0.68s | Variables requeridas presentes y sin formato peligroso detectado. |
| `security:scan` | Pasa, 0.90s | Pasa, 0.83s | No detecto secretos obvios ni specs inseguras en archivos versionables cubiertos. |
| `npm test` | Pasa, 34/34, 1.21s | Pasa, 34/34, 1.17s | Invariantes del codigo y del diagrama estables. |
| `lint` | Pasa, 9.90s | Pasa, 9.92s | Sin errores ESLint. |
| `build` | Pasa, 18.70s | Pasa, 17.67s | Next compila, TypeScript pasa y genera 83 paginas estaticas. |
| `test:smoke` | Falla 2/7, 5.67s | Falla 2/7, 3.42s | Infra base responde; quedan bloqueados los flujos admin por credencial admin invalida. |

Conclusion de repeticion: todo lo que no depende de login admin paso dos veces. El unico fallo repetido y consistente es autenticacion admin `401`.

## 6. Detalle del smoke HTTP

### Vuelta 1

| Smoke | Resultado | Tiempo |
| --- | --- | ---: |
| Health DB | Pasa | 1986ms |
| Registro publico deshabilitado | Pasa | 35ms |
| Endpoints privados sin sesion rechazan acceso | Pasa | 107ms |
| Login invalido devuelve 401 JSON | Pasa | 192ms |
| Admin lee dashboards criticos | Falla | 276ms |
| Admin recorre todos los flujos documentados | Falla | 129ms |
| Usuario limitado no lee metricas admin | Pasa | 2098ms |

### Vuelta 2

| Smoke | Resultado | Tiempo |
| --- | --- | ---: |
| Health DB | Pasa | 1011ms |
| Registro publico deshabilitado | Pasa | 25ms |
| Endpoints privados sin sesion rechazan acceso | Pasa | 94ms |
| Login invalido devuelve 401 JSON | Pasa | 102ms |
| Admin lee dashboards criticos | Falla | 105ms |
| Admin recorre todos los flujos documentados | Falla | 96ms |
| Usuario limitado no lee metricas admin | Pasa | 1141ms |

Fallo exacto repetido:

```text
login failed with status 401
expected 200
actual 401
```

Interpretacion: la credencial admin configurada para smoke no autentica. No es un fallo de CSRF ni de DB:

- CSRF ya fue atravesado correctamente con header `Origin`.
- `/api/health` llego a DB y devolvio `database.ok = true`.
- El usuario limitado si pudo autenticar y fue bloqueado en `/api/admin/metrics` con `403`, que es el comportamiento esperado.

## 7. Flujos certificados actualmente

Estos flujos quedaron cubiertos dos veces por pruebas que pasaron:

### Configuracion y arranque

Certificado por:

- `env:check`
- `build`
- `/api/health`

Resultado:

- Variables requeridas presentes.
- App compila.
- DB accesible desde runtime local cuando el proceso permite la cadena SSL local.

Riesgo pendiente:

- El entorno local requiere `SUPABASE_DB_SSL_REJECT_UNAUTHORIZED=false` para el smoke. En produccion esto no deberia bajarse salvo decision explicita de infraestructura.

### Seguridad de entrada HTTP

Certificado por:

- `security:scan`
- `static.test.mjs`
- Smoke de registro publico.
- Smoke de endpoints privados sin sesion.
- Smoke de login invalido.

Resultado:

- Registro publico sigue bloqueado.
- Endpoints privados devuelven `401` sin sesion.
- Login invalido devuelve `401` JSON, no redirect HTML para cliente JSON.
- El proxy conserva CSRF/rate limit/header guardrails.

### Usuario limitado y permisos admin

Certificado por:

- Smoke con usuario limitado.

Resultado:

- Usuario limitado autentica.
- `/api/admin/metrics` devuelve `403`.

Lectura:

- La barrera de permisos para metricas admin funciona al menos para ese usuario limitado.

### Invariantes comerciales y operativas

Certificado por:

- `npm test`, 34 tests estaticos.

Incluye:

- Flujo de pedidos `cargado -> confirmado -> entregado`.
- Cobro solo se registra/resuelve sobre pedidos entregados.
- Cobranzas con vencimientos y saldos.
- Precios L0-L3 y lista ancla L2.
- Presupuestos y pedidos con comprobantes operativos/fiscales.
- Compras, MRP, aprobaciones y pagos proveedor por codigo.
- Storage privado para recibos.
- Hardening de Supabase, RLS/runtime role y helpers privados.
- Guardrail del diagrama de flujos contra codigo real.

Importante:

- Estos tests prueban estructura, contratos de codigo y reglas criticas, pero no ejecutan mutaciones reales contra la DB.

## 8. Flujos todavia no certificados en runtime

No se pudieron certificar por smoke admin porque `STARLIM_TEST_ADMIN_USER` / `STARLIM_TEST_ADMIN_PASS` no autentican:

- `auth/session` con admin.
- `shell/indicators` por `/api/admin/metrics`.
- `commercial/orders`.
- `commercial/delivered-sales`.
- `commercial/quotes`.
- `master-data/customers`.
- `master-data/products`.
- `master-data/suppliers`.
- `pricing/price-lists`.
- `purchases/register`.
- `purchases/accounts-payable`.
- `collections/pending-approval`.
- `finance/cashflow`.
- `support/messages`.
- `support/tasks`.
- `support/customer-follow-up`.

La matriz existe en `smoke.mjs` y esta lista para correr. El bloqueo no es falta de test: es credencial admin invalida.

## 9. Evaluacion de eficiencia

### Lo eficiente

- Build productivo estable en menos de 19s en ambas vueltas.
- Tests estaticos completos en cerca de 1.2s.
- Lint estable en cerca de 10s.
- Security/env checks por debajo de 1s.
- Smoke publico y de seguridad responde rapido.
- Health bajo de 1986ms a 1011ms en la segunda vuelta, probablemente por conexiones/cache ya calientes.
- Usuario limitado bajo de 2098ms a 1141ms en la segunda vuelta, tambien consistente con calentamiento de conexion y caches.

### Lo no medido aun

No se midieron latencias reales de los endpoints admin/operativos porque la autenticacion admin falla antes de llegar a esos endpoints.

### Umbrales actuales

- Endpoints normales: 5000ms.
- Endpoints pesados: 8000ms.

Estos umbrales son conservadores para smoke. Si luego queremos controlar performance con mas rigor, conviene separar:

- local dev
- staging
- produccion
- cold start
- warm run

## 10. Diagnostico de causa raiz del bloqueo

El fallo admin no es ambiguo:

```text
POST /api/auth/login -> 401
```

El endpoint de login solo devuelve `401` cuando `authenticateUser` no logra una sesion valida. En este contexto las causas probables son:

- Usuario admin de `.env.smoke` incorrecto.
- Password admin de `.env.smoke` incorrecto.
- Usuario existe pero no esta activo.
- Usuario autentica en Supabase Auth, pero no tiene fila activa en `usuario_empresa` / `empresas`.
- Usuario no pertenece a una empresa activa.

Como el usuario limitado si autentica, el sistema de login y Supabase Auth no estan completamente caidos.

## 11. Siguiente paso recomendado

Actualizar solo `.env.smoke` con un admin valido de prueba y repetir:

```bash
npm run test:smoke
npm run test:smoke
```

Si ambas pasan, quedaran certificados los flujos de lectura del diagrama con latencia.

Despues de eso, el siguiente nivel seria agregar una suite staging con mutaciones controladas:

- Crear presupuesto.
- Convertir presupuesto a pedido.
- Confirmar pedido.
- Entregar pedido.
- Registrar cobro.
- Aprobar cobro.
- Crear compra.
- Marcar compra recibida/revisada.
- Registrar pago proveedor o solicitud de aprobacion.
- Crear tarea y mensaje.

Esa suite no deberia correr contra produccion salvo que use una empresa/tenant de prueba y datos descartables.

## 12. Estado final

Estado tecnico actual:

- Codigo compila.
- Lint pasa.
- Tests estaticos pasan dos veces.
- Security scan pasa dos veces.
- Env check pasa dos veces.
- Smoke base pasa dos veces para seguridad, DB y usuario limitado.
- Smoke admin falla dos veces por credencial admin invalida.

Veredicto:

El sistema esta sano a nivel build, reglas estaticas, hardening y acceso DB. Todavia no se puede afirmar que "todos los flujos funcionan eficientemente" en runtime porque la matriz admin queda bloqueada por autenticacion `401`. La infraestructura de test para comprobarlo ya quedo implementada.
