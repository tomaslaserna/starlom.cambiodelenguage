# Página de detalle del cliente + edición con vendedores — Diseño

**Fecha:** 2026-08-11
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

Hoy `/customers` es una tabla con botones inline (Editar/Fusionar/Eliminar), y:
1. El formulario de edición **no permite asignar "vendedor a cargo"** (`assigned_seller`,
   el campo que usa el CRM). Peor: `updateCustomerAction` no lo pasaba como default,
   así que cada edición lo **borraba**. → **Hotfix ya aplicado y deployado**
   (commit `0c7142b`): `updateCustomerAction` conserva `assignedSeller`.
2. No hay una vista de detalle del cliente. Al hacer clic en un cliente no pasa nada;
   toda la info y acciones están apretadas en la fila.

Se quiere: al clickear un cliente, ir a una **página de detalle** con toda su info
(contacto, fiscal, comercial, notas, **historial de compras**), y mover las acciones
(Editar/Fusionar/Eliminar) **dentro** de esa página.

## Decisiones (brainstorming)

- **Historial:** lista de pedidos + resumen (total, N compras, última) + **ritmo**
  (cada cuántos días, próxima compra esperada) usando `customer-rhythm.ts`.
- **Vendedores en edición:** ambos (propio `seller` y a cargo `assignedSeller`) pasan
  a ser **selectores** poblados con `listVendors`, incluyendo el valor actual como
  opción aunque no figure en la lista (para no perderlo — p. ej. un jefe que vende).
- **Lista:** el nombre del cliente pasa a ser un **link** a `/customers/[id]`; se
  **quitan** los botones inline de la fila.
- **Acciones dentro del detalle**, fusionar/eliminar con permiso `clientes.eliminar`.

## Datos disponibles (verificado)

- `getCustomer(companyId, id)` → `CustomerDetail` ya incluye `seller` y `assignedSeller`,
  además de name, businessName, taxIdType, taxId, vatCondition, phone, address, city,
  province, priceList, status, observation.
- `listVendors(companyId)` → `{ id, name }[]` (rol vendedor).
- `sales` (por `client_id`): `commercial_number`, `sale_number`, `sale_date`,
  `total_amount`, `order_status`, `collection_status`, `desired_document`.
- `customer-rhythm.ts`: `customerMetrics(timestamps: number[]) → { average, deviation, intervals }`
  (average = días promedio entre compras). Puro y testeable.

## Componentes

### 1. Backend — historial de compras
`getCustomerPurchaseHistory(companyId, clientId)` (en `lib/catalog.ts` o nuevo
`lib/customer-detail.ts`) → 
```ts
{
  summary: { totalAmount: number; count: number; lastPurchase: string | null };
  rhythm: { averageDays: number; expectedNext: string | null };
  orders: Array<{ id; number; date; amount; orderStatus; collectionStatus }>;
}
```
- `orders`: `SELECT` de `sales` por `empresa_id + client_id`, orden `sale_date DESC`,
  limitado (p. ej. 100 últimas). `number` = `commercial_number` o `sale_number`.
- `summary`: `count` y `totalAmount` = agregados; `lastPurchase` = max fecha.
- `rhythm`: `averageDays` = `customerMetrics(fechas.map(→epoch))` con las fechas de
  compra; `expectedNext` = `lastPurchase + averageDays` (o null si <2 compras).

### 2. Página de detalle `/customers/[id]`
- `page.tsx` (server): `requireStaffSession` + `requirePagePermission(CUSTOMERS_READ_PERMISSION)`;
  carga `getCustomer(id)` (404 → notFound), `getCustomerPurchaseHistory`, `listVendors`,
  y `canDelete = sessionAllows(clientes.eliminar)` + `listClientOptions` (para fusionar).
- Secciones (tarjetas): **Contacto** (teléfono, dirección, localidad, provincia),
  **Fiscal** (tipo ID, CUIT/DNI, cond. IVA), **Comercial** (lista, vendedor propio,
  vendedor a cargo), **Notas** (observación), **Historial** (resumen + ritmo + lista).
- **Acciones** (cabecera): reutiliza el componente existente `CustomerRowActions`
  (Editar/Fusionar/Eliminar), extendido con selectores de vendedor (ver punto 3).
- Link "volver a Clientes".

### 3. Edición con selectores de vendedor
`CustomerRowActions` (ya existe): 
- Recibe `vendors: {id,name}[]` (de `listVendors`).
- El campo "Vendedor" (propio, `seller`) pasa de `Input` a `Select` con `vendors`.
- Se agrega campo **"Vendedor a cargo"** (`assignedSeller`) como `Select` con `vendors`.
- Ambos selects incluyen la opción del valor actual aunque no esté en `vendors`
  (append si falta), y una opción vacía ("Sin asignar").
- `EditableCustomer` suma `assignedSeller`. `updateCustomerAction` ya conserva
  `assignedSeller` (hotfix) y ahora además lo toma del form cuando se envía.

### 4. Lista de clientes (`/customers/page.tsx`)
- El nombre del cliente en la fila pasa a ser un `Link` a `/customers/[id]`.
- Se **elimina** la columna "Acciones" y el `CustomerRowActions` inline
  (las acciones viven en el detalle). Se ajusta el `colSpan` del EmptyState de 7 a 6.
- `allClients`/`canDelete` que hoy calcula la lista para las acciones inline se
  mueven al detalle.

## Manejo de errores

- Detalle de cliente inexistente → `notFound()` (404).
- Historial de un cliente sin ventas → `summary` en cero, `rhythm` null, lista vacía
  (mensaje "Sin compras registradas").
- Edición/fusión/borrado: se mantienen las validaciones actuales (nombre obligatorio,
  borrar solo sin historial, fusionar con confirmación).

## Testing

- Unit (node:test, patrón `collection-methods.test.mjs`): 
  - Cálculo del resumen/ritmo: una función pura `summarizePurchases(fechas, montos)` 
    que devuelva `{ totalAmount, count, lastPurchase, averageDays, expectedNext }`,
    testeable sin DB (reusa `customerMetrics`). `getCustomerPurchaseHistory` la usa.
- Regresión de fuente: `updateCustomerAction` conserva `assignedSeller` (ya existe el
  test del hotfix); el form de edición incluye `name="assignedSeller"`; la fila de
  `/customers` linkea a `/customers/[id]`.
- Verificación viva (`/customers/[id]`) requiere login: se confirma en el deploy.

## Fuera de alcance (YAGNI)

- Editar desde la página de detalle campos que no expone `customerInputFromBody`.
- Paginación del historial (se limita a las últimas 100 compras).
- Gráficos del historial (solo tabla + números).
- Editar leads/CRM desde el detalle del cliente.
- Timeline de interacciones/notas múltiples (solo el campo `observation` actual).
