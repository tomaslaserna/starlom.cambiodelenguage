# Ventas a cobrar en Cobros y pagos — Diseño

Fecha: 2026-07-04
Módulo: Cobros y pagos › Cobros (`/collections`)

## Objetivo

El registro de cobros se quitó del registro de pedidos (`/orders`). La
cobranza pasa a efectuarse desde **Cobros y pagos**: la pantalla
`/collections` deja de mostrar la cola de cobros pendientes de aprobación y
pasa a mostrar las **ventas a cobrar** (entregadas con saldo), con el
formulario para registrar el cobro en cada fila.

La aprobación no se pierde: **Solicitudes y aprobaciones**
(`/admin/approvals`) ya lista y resuelve los cobros registrados (fuente
"Cobro" de `listApprovalCenter`), y sigue siendo el lugar donde
administración aprueba o rechaza.

## Contexto técnico (ya existente)

- `lib/collections.ts`:
  - `listPendingCollections(companyId)` — cobros en
    `pendiente_aprobacion`/`en_proceso`. **La usa `listApprovalCenter`**
    (`lib/approvals.ts`), no se toca.
  - `registerCollection(session, saleId, input)` — valida entregado, saldo,
    estados registrables (`pendiente`/`vencido`) y deja el cobro en
    `pendiente_aprobacion`. Se reusa tal cual.
  - `collectionRegistrationFromBody(body)` — parsea el form. Se reusa.
- `lib/receipt-types.ts`: `desiredDocumentLabel(value)` para mostrar
  "Factura (A/B)" / "Remito".
- `clients.payment_term_days` — plazo de pago del cliente (nullable).
- `sales`: `sale_date`, `receipt_number`/`sale_number`, `desired_document`,
  `total_amount`, `collection_status`; saldo real = `total_amount` −
  `SUM(current_account_movements.credit)` de la venta.
- La ruta API `/api/collections/[id]/register` ya expone el registro con
  permiso `cobranzas.crear` (`COLLECTIONS_CREATE_PERMISSION`).

## Alcance (v1)

- Nueva función `listSalesToCollect(companyId)` en `lib/collections.ts`.
- Nueva server action `registerCollectionAction` en
  `app/collections/actions.ts`.
- Reescribir la tabla de `app/collections/page.tsx` con las columnas
  pedidas y el formulario de registro por fila.

Fuera de alcance: tocar `/admin/approvals`, `listPendingCollections`,
`approveCollection`/`rejectCollection`, la ruta API de registro, o el campo
plazo en la ficha de clientes.

## Cambios

### 1. `lib/collections.ts` — `listSalesToCollect(companyId)`

Consulta sobre `sales v LEFT JOIN clients cli` con los mismos guards
canónicos que `listPendingCollections` (`canonicalSalesSourceSql("v")`,
`normalizedOrderStatusSql("v") = 'entregado'`), pero filtrando:

```sql
WHERE COALESCE(v.collection_status,'pendiente')
        IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')
  AND v.empresa_id = $1
  AND <canónico> AND <entregado>
  AND GREATEST(COALESCE(v.total_amount,0) - COALESCE(approved.total_credit,0), 0) > 0.005
ORDER BY vencimiento ASC, v.sale_date ASC
```

Campos devueltos por fila:

- `id`, `date` (`sale_date`), `receiptNumber` (mismo COALESCE de
  `receipt_number`/`sale_number` usado en `listPendingCollections`),
- `customerName`, `customerTaxId` (`cli.tax_id`, fallback
  `v.client_document`),
- `outstandingAmount` (saldo real, con el mismo LATERAL de créditos
  aprobados),
- `dueDate`: `(v.sale_date + COALESCE(cli.payment_term_days, 0) * INTERVAL '1 day')::date`
  — sin plazo cargado, vence el mismo día (contado),
- `overdue`: `dueDate < CURRENT_DATE` (calculado en SQL),
- `desiredDocument` (`COALESCE(v.desired_document,'remito')`),
- `collectionStatus` (`COALESCE(v.collection_status,'pendiente')`),
- `registeredAmount` (`collection_registered_amount`, para mostrar cuánto
  está en aprobación).

### 2. `app/collections/actions.ts` — `registerCollectionAction`

```ts
export async function registerCollectionAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
  await registerCollection(
    session,
    id,
    collectionRegistrationFromBody(Object.fromEntries(formData.entries())),
  );
  revalidateCollectionFlow();
}
```

(`revalidateCollectionFlow` ya revalida `/collections`,
`/admin/approvals`, `/orders`, cuentas corrientes y métricas.)

### 3. `app/collections/page.tsx` — reescritura de la tabla

- Encabezado: título "Ventas a cobrar", descripción del flujo (registrar
  acá, aprobar en Solicitudes y aprobaciones).
- Se mantiene: guard `sessionCanReadCollections`, búsqueda por texto
  (cliente/CUIT/comprobante), `active="collections"`.
- Stat cards: "Saldo total a cobrar" (suma de `outstandingAmount` visibles)
  y "Ventas vencidas" (count de `overdue`).
- Columnas de la tabla, en este orden:
  1. **Fecha** — `formatDate(date)`
  2. **Nro comprobante** — `#<receiptNumber>`
  3. **Nombre** — `customerName`
  4. **CUIT** — `customerTaxId`
  5. **Monto a cobrar** — `formatCurrency(outstandingAmount)`
  6. **Fecha vencimiento** — `formatDate(dueDate)`; si `overdue`, en rojo
     con badge "Vencida"
  7. **Factura/Remito** — `desiredDocumentLabel(desiredDocument)`
  8. **Acción**:
     - Estado `pendiente`/`vencido`: `<details>` "Registrar cobro" con el
       formulario (monto con `max` = saldo, fecha por defecto hoy, método
       efectivo/transferencia/e-check, destino por defecto "Caja",
       operación, notas) → `registerCollectionAction`. Solo se muestra si
       la sesión tiene `cobranzas.crear` (`sessionAllows`).
     - Estado `pendiente_aprobacion`/`en_proceso`: badge "En aprobación"
       con el monto registrado; sin formulario (evita registros dobles;
       `registerCollection` igual lo rechazaría).
- Se eliminan de esta pantalla: `listPendingCollections`,
  `approveCollectionAction`/`rejectCollectionAction` y sus formularios.
  Las actions de aprobar/rechazar **siguen existiendo** en
  `app/collections/actions.ts`… ver nota siguiente.

**Nota sobre `approveCollectionAction`/`rejectCollectionAction`:** solo las
consumía esta página; `/admin/approvals` usa sus propias actions
(`approveApprovalAction`/`rejectApprovalAction` → `lib/approvals`). Se
eliminan de `app/collections/actions.ts` como código muerto.

## Manejo de errores / bordes

- Venta sin plazo del cliente (`payment_term_days` NULL o sin cliente
  vinculado): vencimiento = fecha de venta.
- Cobro parcial: la fila reaparece tras aprobarse el parcial (saldo > 0) y
  permite registrar el resto. `registerCollection` ya limita el monto al
  saldo.
- Doble registro: estados `pendiente_aprobacion`/`en_proceso` no muestran
  formulario; ante una carrera, `registerCollection` rechaza con 400.
- Usuario con `cobranzas.leer` pero sin `cobranzas.crear`: ve el listado,
  no ve el formulario.

## Testing / verificación

Actualizar `apps/web/scripts/static.test.mjs`:

- El test "collection registration is off the orders register but still
  guarded" pasa a verificar además que `/collections` registra:
  `listSalesToCollect`, `registerCollectionAction`, `Registrar cobro`,
  `payment_term_days` (vencimiento por plazo) y `desiredDocumentLabel` en
  la página/lib.
- Verificar que `app/collections/actions.ts` ya no exporta
  `approveCollectionAction`/`rejectCollectionAction` y que
  `/admin/approvals` sigue usando `approveApprovalAction`.

Suite completa (`node --test scripts/static.test.mjs`), `tsc --noEmit` y
`eslint` sobre los archivos tocados. Verificación funcional en producción
tras deploy (no hay `.env` local).

## Archivos afectados

- Editar: `apps/web/src/lib/collections.ts` (nueva `listSalesToCollect`)
- Editar: `apps/web/src/app/collections/actions.ts` (nueva
  `registerCollectionAction`; se van approve/reject)
- Editar: `apps/web/src/app/collections/page.tsx` (reescritura de la vista)
- Editar: `apps/web/scripts/static.test.mjs` (tests del nuevo flujo)
