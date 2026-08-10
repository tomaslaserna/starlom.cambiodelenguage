# CRM vendedor — Pestañas Presupuestos y Listas de precios

Fecha: 2026-08-05
Estado: diseño aprobado (pendiente revisión de spec)

## Contexto

El segundo mundo del CRM (`/crm`) ya tiene **Perfil** y **Clientes** (Fase 1, mergeado). Las pestañas **Presupuestos** (`/crm/presupuestos`) y **Listas de precios** (`/crm/listas`) son hoy stubs "Próximamente". Este spec las construye.

Ambas son **vistas de solo lectura** para el vendedor sobre datos que ya existen. El vendedor NO crea presupuestos acá (eso vive en `/quotes`); acá los **sigue**. Las listas las publica Administración; acá el vendedor las **ve y descarga**.

Patrón a seguir (ya establecido): página server (`page.tsx`) que valida sesión con `requireStaffSession` + `sessionCanUseCrm`, lee datos vía `lib/crm.ts`, y renderiza con `ModulePage` / `Card` / `PageHeader` y los tokens `var(--...)`. La interactividad (filtros, tabs) va en un componente client tipo `clientes-dashboard.tsx`. Mutaciones (si hubiera) en `crm/actions.ts` con server actions.

Vínculo vendedor↔datos: por texto, con `sellerCandidates(session)` (username / nombre / primer nombre en MAYÚSCULAS), igual que `getVendorProfile`.

## Alcance

**Incluye**
- Pestaña Presupuestos: seguimiento de los presupuestos del vendedor (vigentes / por vencer / vencidos / aceptados) + panel "clientes que piden mucho presupuesto".
- Pestaña Listas de precios: listado de listas activas con vigencia + descarga PDF (reusa endpoint existente).

**No incluye (YAGNI)**
- Crear/editar presupuestos desde el CRM (ya existe en `/quotes`).
- Tabla de precios "en vivo" en pantalla en la pestaña Listas (decisión del usuario: solo descarga PDF; se puede agregar después).
- Cualquier cambio al modelo de datos (no hay migraciones).

## Pestaña Presupuestos

### Datos — `getVendorQuotes(session)` en `lib/crm.ts`
Consulta `quotes` de la empresa filtradas por vendedor (`q.seller_id → profiles`, con `UPPER(BTRIM(COALESCE(p.username, p.full_name,''))) = ANY(sellerCandidates)`), reutilizando el cálculo de vencimiento de `listQuotes`:
`dias_restantes = (created_at::date + validity_days) - CURRENT_DATE`.

Devuelve, por presupuesto: `id`, `quoteNumber` (P-000x), `clientName`, `total`, `issueDate`, `expirationDate`, `daysRemaining`, `status`.

**Buckets (mutuamente excluyentes)** — helper puro `classifyQuote(status, daysRemaining)`:
- `vencidos`: `status='pendiente'` y `daysRemaining < 0`
- `por_vencer`: `status='pendiente'` y `0 ≤ daysRemaining ≤ 3`
- `vigentes`: `status='pendiente'` y `daysRemaining > 3`
- `aceptados`: `status='aceptada'` y `approved_at` en el mes corriente

**Panel "clientes que piden mucho"** — helper puro `topQuoteClients(quotes, n=5)`:
agrupa los presupuestos del vendedor por cliente → `{ clientName, cantidad, aceptados }` donde `cantidad` = número de presupuestos y `aceptados` = cuántos se convirtieron. Ordena por `cantidad` desc (desempata por `aceptados` asc, para que arriba queden los que piden mucho y cierran poco), top N. Señala baja conversión (`aceptados/cantidad` bajo) como oportunidad.

### UI — `presupuestos-dashboard.tsx` (client)
- **4 tarjetas resumen** (Vigentes · Por vencer · Vencidos · Aceptados del mes), clickeables, con conteo — mismo estilo que las tarjetas de `clientes-dashboard`.
- **Lista del bucket elegido**: cada fila = `P-000x` · cliente · total · leyenda de vencimiento ("vence en X días" / "vencido hace X días" / "aceptado"). Cada fila linkea al **PDF del presupuesto**: `/api/pdfs/quotes/{id}`.
- **Panel "Clientes que piden mucho"**: lista compacta top-5 con cantidad y aceptados.
- Estado vacío por bucket con copy amable.

## Pestaña Listas de precios

### Datos
Query liviana sobre `listas_precio` activas (`activa=1`) con vigencia. Reusa `listPriceListParameters(companyId)` (ya trae `name`, `order`, `validFrom`, `validTo`, `active`) filtrando activas y ordenando por `order`.

### UI — server component en `listas/page.tsx` (sin estado, no necesita client)
- Lista de listas publicadas (L0…Minorista): **nombre**, rol/descripción corta, **vigencia** ("Vigente" o "Válida hasta {fecha}" si hay `validTo`), y botón **Descargar PDF**.
- Botón PDF → `GET /api/pdfs/pricing/price-list?list={id}&iva=21&groupBy=categoria&stock=todos&download=1` (defaults sensatos).
- Helper puro `formatVigencia(validFrom, validTo)` → texto legible (testeable).

## Permisos (a resolver en implementación)

Los endpoints PDF exigen permisos que el rol **vendedor** podría no tener:
- `/api/pdfs/pricing/price-list` exige `productos:ver`.
- `/api/pdfs/quotes/[id]` exige su permiso de quotes/ventas.

Checkpoint: verificar qué permisos tiene el rol vendedor. Si le faltan, la opción preferida es **permitir estos dos PDF bajo el permiso de CRM** (o el que ya tenga el vendedor) en las rutas API, sin ampliar de más. No romper el acceso actual de otros roles.

## Testing

Helpers puros con `node --test` (estilo `*.test.mjs` existente en `apps/web/scripts/`):
- `classifyQuote(status, daysRemaining)` → bucket correcto en bordes (−1, 0, 3, 4).
- `topQuoteClients(quotes, n)` → agrupación, orden y corte.
- `formatVigencia(from, to)` → "Vigente" vs "Válida hasta …".

Las páginas server quedan finas (sin lógica testeable propia). Verificación en la app: abrir `/crm/presupuestos` y `/crm/listas` con sesión de vendedor, ver los buckets y descargar un PDF.

## Archivos

- `lib/crm.ts` — `getVendorQuotes`, helpers `classifyQuote`, `topQuoteClients`, `formatVigencia` (o helpers en módulo aparte si conviene testear sin `@/`).
- `app/crm/presupuestos/page.tsx` — reemplaza stub; server → `presupuestos-dashboard.tsx`.
- `app/crm/presupuestos/presupuestos-dashboard.tsx` — nuevo (client).
- `app/crm/listas/page.tsx` — reemplaza stub; server, sin componente client.
- Rutas API PDF — ajuste de permisos si hace falta (checkpoint arriba).
- `apps/web/scripts/*.test.mjs` — tests de los helpers puros.
