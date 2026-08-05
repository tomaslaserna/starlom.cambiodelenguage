# Balance por período + Tendencia (Pieza A + B)

Fecha: 2026-08-05
Estado: diseño aprobado (pendiente revisión de spec)

## Contexto

El módulo Administración ya tiene un P&L operativo en `/balance` y `/metrics`, alimentado por `getAdminMetrics(companyId)` (`apps/web/src/lib/admin-metrics.ts`). Hoy ese motor está **fijado al mes actual**: `monthBounds()` calcula `{ previousStart, currentStart, nextStart }` para el mes en curso, y el SQL ya filtra por esos límites (`$1=previousStart, $2=currentStart, $3=nextStart, $4=companyId`) comparando mes actual vs mes anterior con Δ%.

Limitaciones que esto resuelve:
- No se puede ver el balance de un **mes pasado puntual** ni el **acumulado anual**.
- La "tendencia" de `/metrics` es **sintética** (`trendSeries` interpola entre mes actual y anterior con una onda); no hay serie histórica real.

Datos disponibles desde ~2026-01. Gráficos en el repo se hacen con **SVG inline** (sin librería externa), ver `/metrics`.

## Alcance

**Incluye**
- **A — Balance por período:** selector de período (mes puntual / año acumulado) en `/balance`; todo el P&L se recalcula para el período elegido con su Δ% vs el período comparable anterior.
- **B — Tendencia real:** sección "Evolución" en `/balance` con tabla mes-a-mes + gráfico SVG de **facturación neta, ganancia bruta y margen %** (datos históricos reales).

**No incluye (YAGNI)**
- Trimestres (solo mes + año).
- Tocar `/metrics` (su tendencia sintética queda como está; se puede migrar después).
- Resultado operativo *por mes* en la serie (ver Nota de alcance).
- Export PDF / informe para socios (Pieza E, aparte).
- Cambios al cálculo de costos/márgenes existente (se reusa tal cual).

## A — Balance por período

### Helper puro de períodos — `src/lib/period-range.ts` (nuevo, sin `@/`)
Testeable con `node --test` importando el `.ts` directo (patrón `price-list-export.ts`). Reusa la lógica de `month-range.ts` replicada localmente o vía funciones puras.

- `type Period = { kind: "month"; key: string /* "YYYY-MM" */ } | { kind: "year"; key: string /* "YYYY" */ }`
- `parsePeriod(raw: string | null | undefined, fallbackMonthKey: string): Period` — `"2026-03"` → month; `"2026"` → year; vacío/inválido → month(fallback).
- `periodBounds(period: Period): { previousStart: string; currentStart: string; nextStart: string }`
  - month `"YYYY-MM"`: `currentStart` = primer día del mes; `nextStart` = primer día del mes siguiente; `previousStart` = primer día del mes anterior.
  - year `"YYYY"`: `currentStart` = `YYYY-01-01`; `nextStart` = `(YYYY+1)-01-01`; `previousStart` = `(YYYY-1)-01-01`.
- `periodLabel(period: Period): string` — `"Marzo 2026"` / `"Año 2026"`.
- `availablePeriods(earliestMonthKey: string, currentMonthKey: string): Period[]` — meses desde el más antiguo hasta el actual (desc) + los años involucrados. Alimenta el selector.

### Motor — `admin-metrics.ts`
- `getAdminMetrics(companyId, period?: Period)`: si no se pasa `period`, usa el mes actual (comportamiento actual intacto). Internamente `loadAdminMetrics(companyId, bounds)` recibe los `bounds` de `periodBounds(period)` en vez de `monthBounds()`.
- El SQL no cambia estructuralmente (ya usa `$1/$2/$3`); solo cambia de dónde salen los bounds.
- **Cache:** hoy `adminMetricsCache` está keyed por `companyId`. Pasa a estar keyed por `` `${companyId}:${period.key}` `` (las keys `"2026"` año y `"2026-03"` mes ya son distintas entre sí). El mes actual sigue cacheado igual.
- `getBalanceDashboard(companyId, period?)` propaga el `period` a `getAdminMetrics`. `getAccountsPayable`/`getCashflow` (por-cobrar/pagar y cashflow): en esta pieza se dejan como están (saldos "a hoy"), porque son posiciones, no flujo del período. Se documenta que "Por cobrar/Por pagar" son a la fecha, no del período. (Refinar cashflow por período = mejora futura.)

### UI — `/balance`
- **Selector de período** (client component `PeriodPicker`): dropdown de meses + toggle Mes/Año, construido desde `availablePeriods`. Al cambiar, navega actualizando `?period=` (searchParams). Server component re-renderiza.
- La página (server) lee `searchParams.period`, arma `Period` con `parsePeriod`, y pasa a `getBalanceDashboard(companyId, period)`. Muestra el período elegido en el título/encabezado.
- El resto del layout del P&L queda igual (StatCards, resumen, cash flow), pero con los números del período.

## B — Tendencia

### Datos — `getMonthlySeries(companyId, year)` en `admin-metrics.ts`
Un query agrupando por `date_trunc('month', sale_date)` sobre el año, con los mismos filtros que `getAdminMetrics` (`canonicalSalesSourceSql`, `normalizedOrderStatusSql = 'entregado'`, `netSalesAmountSql` para neto, y la **misma expresión de costo** que produce `margin.grossCost`). Devuelve una fila por mes:
- `type MonthlyPoint = { monthKey: string; facturacion: number; gananciaBruta: number; margenPct: number | null }`
- Meses sin ventas se completan en JS con ceros para tener los 12 (o hasta el mes actual).
- `margenPct` = `gananciaBruta / facturacion * 100` (o `null` si facturación 0). Helper puro `marginPercent(bruta, facturacion)` testeable.

### UI — sección "Evolución" en `/balance`
- **Tabla** mes-a-mes: mes, facturación, ganancia bruta, margen %.
- **Gráfico SVG inline** (server-rendered, sin librería): barras de facturación por mes + línea de margen %. Theme-aware con `var(--…)`. Estilo consistente con `/metrics`.
- Se muestra el año del período elegido (si el período es un mes, se grafica el año de ese mes).

## Nota de alcance (resultado operativo)

`margin.operatingResult` resta costos fijos/sueldos que son una **config mensual actual** (`getSalaryPlan`), no un histórico por mes. Por eso:
- En **A** (período puntual) se muestra el resultado operativo aplicando esa config (consistente con el balance actual).
- En **B** (tendencia) se grafica solo lo **genuinamente histórico** (facturación, ganancia bruta, margen %). No se incluye resultado operativo por mes para no ensuciar la serie con un costo fijo constante.

## Testing

Helpers puros con `node --test` (`apps/web/scripts/*.test.mjs`):
- `parsePeriod` / `periodBounds` / `periodLabel` — bordes: `"2026-01"`, `"2026-12"`, año `"2026"`, entrada inválida → fallback.
- `availablePeriods` — genera meses correctos y los años.
- `marginPercent` — bruta/facturación, y facturación 0 → null.

Verificación de queries contra prod (`.env.local` SUPABASE_DB_*) comparando un mes conocido (ej. el actual) contra el balance actual. UI logueada como admin/jefe (permisos `admin.balance` / `reportes`): no verificable sin credenciales; gates automáticos = tests + lint + tsc.

## Archivos

- Create: `apps/web/src/lib/period-range.ts` (puro) + `apps/web/scripts/period-range.test.mjs`.
- Modify: `apps/web/src/lib/admin-metrics.ts` (`getAdminMetrics(companyId, period?)`, cache por período, `getMonthlySeries`).
- Modify: `apps/web/src/lib/finance.ts` (`getBalanceDashboard(companyId, period?)`).
- Modify: `apps/web/src/app/balance/page.tsx` (leer `searchParams`, selector, sección Evolución).
- Create: `apps/web/src/app/balance/period-picker.tsx` (client) y el componente de tabla+gráfico (server) — o inline en la página si queda chico.
