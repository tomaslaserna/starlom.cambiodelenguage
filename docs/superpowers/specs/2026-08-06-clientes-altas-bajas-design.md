# Clientes: altas y bajas por período (Pieza C)

Fecha: 2026-08-06
Estado: diseño aprobado (pendiente revisión de spec)

## Contexto

Continuación del programa de balances/reportes (ver [[balances-reportes]]). Piezas A+B (balance por período + tendencia) ya están en prod. Esta es la Pieza C: **altas y bajas de clientes por período** (churn) como sección de `/balance`, reaccionando al selector de período que ya existe.

El sistema ya clasifica clientes por **ritmo de compra** en `getCustomerFollowUp` (`apps/web/src/lib/messages.ts`): por cliente arma los timestamps de compras entregadas (día, ancla `-03:00` vía `dayStart`), y con `customerMetrics(timestamps)` obtiene el `average` (intervalo promedio ponderado, con recorte por mediana). "Perdido" = `daysSince / average > 2`. Ese cálculo es un **snapshot a hoy**, no un evento datable por período.

`customerMetrics` y `median` son funciones **puras** (sin imports `@/`), hoy privadas en `messages.ts`.

## Alcance

**Incluye**
- Definición datable de alta/baja por período y su cómputo (`getCustomerChurn`).
- Refactor chico: extraer `customerMetrics` + `median` a un módulo puro reutilizable y testeable.
- Sección "Clientes: altas y bajas" en `/balance`, ligada al selector de período.

**No incluye (YAGNI)**
- Churn por vendedor (esto es vista admin/balance, company-wide).
- Export/PDF (Pieza E).
- Cambiar la clasificación de `getCustomerFollowUp` (se mantiene igual, solo se reusa su matemática).

## Definiciones (período P = `[bounds.currentStart, bounds.nextStart)`)

Por cliente, sobre ventas **canónicas y entregadas** (mismos filtros que `getCustomerFollowUp`):
- Timestamps de compra (día, ancla `-03:00`), ordenados y únicos. `first` = min, `last` = max, `purchases` = cantidad.
- **Alta:** `first ∈ P` → primera compra del cliente dentro de P.
- **Baja:** `purchases ≥ 2` y `lostDate = last + 2 × customerMetrics(timestamps).average` (en días) `∈ P`. Consistente con el "perdido" del follow-up (ratio > 2).
- **Neto** = altas − bajas.

Nota: un cliente con 1 sola compra no tiene ritmo → nunca es "baja" (sí puede ser "alta"). Un cliente que recompra corre su `last` y por ende su `lostDate` (no queda contado como baja si volvió a comprar).

## Refactor: `customer-rhythm.ts` (puro)

Crear `apps/web/src/lib/customer-rhythm.ts` SIN imports `@/`, con:
- `median(values: number[]): number` (movido tal cual desde `messages.ts`)
- `customerMetrics(timestamps: number[]): { average: number; deviation: number; intervals: number }` (movido tal cual)
- `classifyChurn(timestamps: number[], periodStartMs: number, periodNextMs: number): { alta: boolean; baja: boolean; firstMs: number | null; lostMs: number | null }` (nuevo): calcula `first`/`last`, aplica las definiciones de arriba usando `customerMetrics`, y devuelve además `firstMs` (fecha de alta) y `lostMs = last + 2×average` (fecha de baja) para que el llamador arme las listas sin recalcular.

`messages.ts` pasa a importar `median`/`customerMetrics` desde `@/lib/customer-rhythm` (borra las copias locales; comportamiento idéntico).

## Datos: `getCustomerChurn(companyId, bounds)` en `messages.ts`

- Reusa la consulta de `getCustomerFollowUp` (clientes + fechas de ventas entregadas por cliente) para armar los timestamps por cliente con `dayStart`.
- Convierte `bounds.currentStart`/`bounds.nextStart` (strings `YYYY-MM-DD`) a ms con el **mismo ancla** que `dayStart` (`T00:00:00-03:00`).
- Para cada cliente aplica `classifyChurn`. Junta:
  - `altas`: `{ customerId, customerName, seller, date }` (date = `first`)
  - `bajas`: `{ customerId, customerName, seller, date }` (date = `lostDate`)
- Devuelve `{ altas, bajas, counts: { altas, bajas, net } }`, listas ordenadas por fecha.

## UI: sección en `/balance` — `churn-clientes.tsx` (server)

- La página ya resuelve `period`; se agrega `const churnBounds = periodBounds(period)` y `const churn = await getCustomerChurn(companyId, churnBounds)`.
- Componente `ChurnClientes`: 3 tarjetas (Altas · Bajas · Neto, con color) y dos listas cortas (Nuevos / Perdidos) con nombre + fecha (vendedor como subtítulo). Tablas con `DataTable` de `@/components/ui` (regla del repo: nada de `<table>` crudo). Estados vacíos amables.
- Se ubica al final de la página, después de "Evolución".

## Testing

`node --test` sobre `customer-rhythm.ts`:
- `customerMetrics`: caso conocido de gaps → average esperado; caso 1 compra (gaps vacío) → average 1.
- `classifyChurn`: alta cuando `first` cae en P y no cuando cae fuera; baja cuando `last + 2×average` cae en P y no cuando el cliente tiene 1 sola compra; recompra que mueve el `lastDate` fuera de P → no baja.

Query verificada contra prod comparando un mes conocido. UI logueada como admin/jefe: no verificable sin credenciales; gates automáticos = tests + lint + build.

## Archivos

- Create: `apps/web/src/lib/customer-rhythm.ts` + `apps/web/scripts/customer-rhythm.test.mjs`.
- Modify: `apps/web/src/lib/messages.ts` (import de rhythm; `getCustomerChurn`).
- Modify: `apps/web/src/app/balance/page.tsx` (bounds + fetch + render).
- Create: `apps/web/src/app/balance/churn-clientes.tsx`.
- Modify: `apps/web/package.json` (agregar el test).
