# Rentabilidad (Fase B.1) — Diseño

Fecha: 2026-07-01
Módulo: Administración › Rentabilidad (`/rentabilidad`)

## Objetivo

Un módulo de Rentabilidad en Administración que permita cargar los costos
operativos del mes y muestre el estado del **punto de equilibrio** (PE): cuánto
margen acumuló la empresa en el mes vs los costos fijos a cubrir, y si ya se
alcanzó el PE. Provee el motor que después usará el gating de ofertas (Fase B.2).

Definición de PE (del usuario): se alcanza cuando el **margen acumulado del mes
supera los costos fijos del mes**. Ahí se habilitan las ofertas.

## Alcance (Fase B.1)

- ABM de costos operativos (cargar/listar/eliminar) sobre la tabla existente
  `costos_operativos` (hoy sin loader).
- Panel de rentabilidad + estado del PE para un mes.
- Motor `getBreakEvenStatus` reutilizable (lo consume el panel y, luego, el gating).

Fuera de alcance: el gating de ofertas en "Cargar pedido" (Fase B.2); desglose de
costos fijos vs variables (todo `costos_operativos` se trata como costo fijo del
mes); proyecciones.

## Modelo (supuestos aprobados)

- **Período:** mes calendario. Por defecto el mes actual; navegable por `?month=YYYY-MM`.
- **Costos fijos del mes** = `SUM(monto)` de `costos_operativos` con `fecha` dentro del mes.
- **Margen acumulado del mes** = ingresos − costo de mercadería (COGS) de las
  ventas **entregadas** del mes:
  - ingresos = `SUM(sale_items.total_amount)` de las `sale_items` cuyas `sales`
    tienen `order_status = 'entregado'` (normalizado) y `sale_date` en el mes.
  - COGS = `SUM(products.cost * sale_items.quantity)` sobre esas mismas líneas.
  - margen = ingresos − COGS.
- **PE alcanzado** = margen acumulado ≥ costos fijos del mes.
- **Faltante** = `max(costosFijos − margen, 0)`.
- **Rentabilidad (ganancia) del mes** = margen − costos fijos (puede ser negativa).

Nota: no hay tabla nueva (se usa `costos_operativos`) → **sin migración**.

## Datos existentes (verificados)

- `costos_operativos(id, empresa_id, concepto, monto, categoria, fecha, created_at, updated_at)`
  — existe, vacía, solo se leía en `admin-metrics.ts`.
- `sales(order_status, sale_date, total_amount, empresa_id, ...)`,
  `sale_items(sale_id, product_id, quantity, total_amount, empresa_id)`,
  `products(cost, empresa_id)`.
- Estado normalizado de pedido: usar `normalizedOrderStatusSql("s")` de
  `@/lib/order-status` (mapea `registrada`→`cargado`, etc.).

## Backend — `src/lib/profitability.ts`

Módulo nuevo (patrón `queryWithCompanyContext` / `withCompanyContext`):

```ts
export type OperatingCost = {
  id: string;
  concept: string;
  amount: number;
  category: string;
  date: string; // YYYY-MM-DD
};

export type OperatingCostInput = {
  concept: string;
  amount: number;
  category: string;
  date: string;
};

export type BreakEvenStatus = {
  month: string;          // YYYY-MM
  fixedCosts: number;     // Σ costos_operativos del mes
  accumulatedMargin: number; // ingresos − COGS de entregados del mes
  revenue: number;
  cogs: number;
  reached: boolean;       // accumulatedMargin >= fixedCosts
  remaining: number;      // max(fixedCosts − accumulatedMargin, 0)
  profit: number;         // accumulatedMargin − fixedCosts
};

listOperatingCosts(companyId, month): Promise<OperatingCost[]>
createOperatingCost(companyId, input): Promise<string>
deleteOperatingCost(companyId, id): Promise<void>
operatingCostInputFromBody(body): OperatingCostInput   // valida concepto/monto/fecha
getBreakEvenStatus(companyId, month): Promise<BreakEvenStatus>
```

`month` es `YYYY-MM`. Las consultas filtran por rango `[primer día, primer día del
mes siguiente)` sobre `fecha`/`sale_date`. Validación en
`operatingCostInputFromBody`: `concept` no vacío, `amount` numérico > 0, `date`
`YYYY-MM-DD` válida; sino `ApiError(400, ...)`.

**`getBreakEvenStatus` es la unidad reutilizable** (la consume el panel y, en
Fase B.2, el gating). Un helper puro de mes (parseo/rango `YYYY-MM` → fechas)
puede vivir en un módulo sin imports `@/` para poder unit-testearlo con node.

## Página — `/rentabilidad`

`src/app/rentabilidad/page.tsx` + `actions.ts`. Patrón `ModulePage`/`PageHeader`/
`StatCard`/`Card`/`DataTable`/`Field`/`Input`/`Button`.

- **Protección:** `requireStaffSession` + `requirePagePermission(session, [ADMIN_METRICS_READ_PERMISSION])`.
- **Selector de mes:** por `?month=YYYY-MM` (default mes actual) con un pequeño form
  o links prev/next.
- **Panel PE (StatCards):** Costos fijos del mes, Margen acumulado, Faltante para
  PE (o "PE alcanzado ✅"), Rentabilidad del mes. Un `StatusBadge`
  verde/neutral según `reached`.
- **Costos operativos del mes:** tabla (concepto, categoría, fecha, monto) +
  formulario de alta (concepto, monto, fecha con default hoy, categoría opcional)
  + acción eliminar por fila.
- **`active`** del `ModulePage`: `"admin"` (queda en el área de Administración).

**Server actions** (`actions.ts`): `createOperatingCostAction`,
`deleteOperatingCostAction`, ambas con `requireAdminApiSession`,
`revalidatePath("/rentabilidad")`, redirect de vuelta al mes.

## Navegación

Agregar ítem **"Rentabilidad"** al grupo **"Administrador"** en
`src/lib/navigation.ts` (junto a Panel admin / Métricas / Solicitudes), con
`href: "/rentabilidad"`, `active: "admin"`, `permission: ADMIN_METRICS_READ_PERMISSION`.
Correr `static.test.mjs` tras el cambio de nav y actualizar aserciones si alguna
quedara obsoleta (hace pattern-match sobre `navigation.ts`).

## Manejo de errores / bordes

- Mes sin costos cargados → costos fijos = 0 → PE "alcanzado" trivialmente si hay
  algún margen. Aceptable en B.1 (el sentido lo da cargar los costos). El panel
  igualmente muestra los números reales.
- Mes sin ventas entregadas → margen 0.
- Monto no numérico o ≤ 0, concepto vacío, fecha inválida → `ApiError(400)`.
- `?month` inválido → usar el mes actual.

## Testing / verificación

- **Unitario:** el helper puro de mes (parseo `YYYY-MM` → rango de fechas
  `[inicio, finExclusivo)`) → test `node --test` (mes normal, borde de fin de año,
  formato inválido).
- **Funcional (autenticado):** cargar un costo operativo del mes → aparece en la
  tabla y suma a "Costos fijos"; el panel muestra margen acumulado (de ventas
  entregadas reales) y el estado PE coherente; eliminar un costo lo saca.
- Correr `static.test.mjs` (12/12) + `order-confirmation.test.mjs` (7/7) tras los
  cambios; actualizar aserciones de nav si aplica.

## Archivos afectados

- Crear: `apps/web/src/lib/profitability.ts`
- Crear: helper puro de mes (p.ej. `apps/web/src/lib/month-range.ts`, sin imports `@/`) + su test en `apps/web/scripts/`
- Crear: `apps/web/src/app/rentabilidad/page.tsx`
- Crear: `apps/web/src/app/rentabilidad/actions.ts`
- Editar: `apps/web/src/lib/navigation.ts` (ítem Rentabilidad en grupo Administrador)
