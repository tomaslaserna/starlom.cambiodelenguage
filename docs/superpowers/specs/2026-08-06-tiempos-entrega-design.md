# Tiempos de entrega por período (Pieza D)

Fecha: 2026-08-06
Estado: diseño aprobado (pendiente revisión de spec)

## Contexto

Continuación del programa de balances/reportes ([[balances-reportes]]). Piezas A, B y C ya en prod. Pieza D: **tiempos de entrega** (cargado→entregado) como sección de `/balance`, ligada al selector de período.

Hallazgo clave: **no hace falta instrumentar de cero.** `updateOrderStatus` (`apps/web/src/lib/orders.ts`) ya inserta en `eventos_integracion` un evento `pedido.entregado` con `created_at` (timestamptz) y `datos->>'id'` = id de la venta. La tabla `order_status_history` está **huérfana** (0 filas, sin código que la escriba) — se ignora.

Realidad de datos: hoy hay **~8** eventos `pedido.entregado` (desde 2026-07-03); el resto de las ~742 ventas se cargaron en bloque desde VENTAS ANUAL sin transición. El reporte arranca chico y **crece solo** al usar el flujo cargado→entregado en la app. `eventos_integracion` schema: `id, tipo, datos jsonb, empresa_id, created_at timestamptz`.

## Alcance

**Incluye**
- `getDeliveryTimes(companyId, bounds)`: reporte de tiempos de entrega del período desde `eventos_integracion`.
- Helper puro `delivery-times.ts` (resumen + formato de duración) testeable.
- Sección "Tiempos de entrega" en `/balance`.

**No incluye (YAGNI)**
- Instrumentación nueva (los eventos ya se registran).
- Poblar/usar `order_status_history`.
- Reconstruir tiempos de ventas importadas en bloque (no tuvieron transición real).

## Definiciones

Por cada evento `pedido.entregado` cuyo `created_at` cae en el período `[currentStart, nextStart)` (ancla AR `-03:00`):
- **Inicio** = `sales.created_at` (cuando el pedido entró al sistema).
- **Entrega** = `evento.created_at`.
- **Lead time** = entrega − inicio (ms).

El filtro de período es por **fecha de entrega**.

## Datos: `getDeliveryTimes(companyId, bounds)` en `orders.ts`

Query:
```sql
SELECT (e.datos->>'id') AS sale_id,
       COALESCE(NULLIF(s.sale_number,''), '') AS pedido,
       COALESCE(NULLIF(s.client_name,''), c.display_name, c.legal_name, '') AS cliente,
       s.created_at::text AS started_at,
       e.created_at::text AS delivered_at
FROM eventos_integracion e
JOIN sales s ON s.id = (e.datos->>'id')::uuid AND s.empresa_id = e.empresa_id
LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
WHERE e.empresa_id = $1
  AND e.tipo = 'pedido.entregado'
  AND e.created_at >= ($2 || 'T00:00:00-03:00')::timestamptz
  AND e.created_at <  ($3 || 'T00:00:00-03:00')::timestamptz
ORDER BY e.created_at DESC
```
($2 = `bounds.currentStart`, $3 = `bounds.nextStart`.)

En JS: por fila, `leadMs = Date.parse(delivered_at) - Date.parse(started_at)`. Se descartan negativos. Devuelve:
- `type Delivery = { saleId: string; pedido: string; cliente: string; deliveredAt: string; leadMs: number }`
- `{ deliveries: Delivery[]; summary: { count: number; avgMs: number | null; medianMs: number | null } }` (usa `summarizeDurations`).

## Helper puro: `delivery-times.ts` (sin `@/`)

- `summarizeDurations(durationsMs: number[]): { count: number; avgMs: number | null; medianMs: number | null }` — filtra finitos ≥0; promedio y mediana; listas vacías → nulls.
- `formatDuration(ms: number): string` — `"2 d 3 h"`, `"5 h 20 min"`, `"45 min"`. Autocontenido (su propia mediana; no importa de otros módulos, para test-safety con `node --test`).

## UI: sección "Tiempos de entrega" en `/balance` — `tiempos-entrega.tsx` (server)

- La página ya resuelve `period`; se agrega `const entregas = await getDeliveryTimes(companyId, periodBounds(period))`.
- Componente `TiemposEntrega`: 3 tarjetas (Entregas · Promedio · Mediana, con `formatDuration`) + tabla (`DataTable`) de las entregas del período: pedido, cliente, fecha de entrega, tiempo (`formatDuration`).
- Estado vacío: "Se llena a medida que marcás pedidos como entregados en la app (cargado → entregado)."
- Se ubica al final, después de "Clientes: altas y bajas".

## Testing

`node --test` sobre `delivery-times.ts`:
- `summarizeDurations`: lista con valores → count/avg/median correctos; lista vacía → `{count:0, avgMs:null, medianMs:null}`; descarta negativos.
- `formatDuration`: `< 1h` → min; `< 1d` → `h min`; `>= 1d` → `d h`.

Query verificada contra prod (los ~8 eventos actuales dan tiempos plausibles). UI logueada como admin/jefe: no verificable sin credenciales; gates = tests + lint + build.

## Archivos

- Create: `apps/web/src/lib/delivery-times.ts` + `apps/web/scripts/delivery-times.test.mjs`.
- Modify: `apps/web/src/lib/orders.ts` (`getDeliveryTimes`).
- Modify: `apps/web/src/app/balance/page.tsx` (fetch + render).
- Create: `apps/web/src/app/balance/tiempos-entrega.tsx`.
- Modify: `apps/web/package.json` (agregar el test).
