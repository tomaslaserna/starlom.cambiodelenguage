# Cobros v2: saldo vinculado, PDF real, orden de cobro y panel superpuesto — Diseño

Fecha: 2026-07-04
Módulo: Cobros y pagos › Cobros (`/collections`)

## Objetivo

Cuatro mejoras sobre la pantalla "Ventas a cobrar":

1. **Saldo vinculado a la venta**: modificaciones, descuentos, notas de
   crédito y notas de débito afectan el monto a cobrar.
2. **Columna DOCUMENTO**: el PDF baja el comprobante real (factura fiscal →
   remito → solicitud como último recurso).
3. **Columna ACCIÓN**: menú desplegable con "Registrar pago" y "Emitir
   orden de cobro".
4. **Panel superpuesto**: el formulario de registro se abre como modal
   centrado sobre la pantalla (no disrumpe la tabla).

El envío a aprobación de administración ya funciona así (el cobro queda
`pendiente_aprobacion` y la bandeja de Solicitudes y aprobaciones muestra
método/destino/operación/saldos), no cambia.

## Contexto técnico (ya existente)

- Las notas de crédito/débito fiscales (lib/fiscal.ts) insertan movimientos
  en `current_account_movements` con `sale_id` y descripción
  `Nota de credito fiscal …` / `Nota de debito fiscal …` (crédito y débito
  respectivamente). El cálculo actual de saldo (`total_amount − SUM(credit)`)
  ya absorbe las NC y los cobros aprobados, pero **ignora las ND**.
- Las modificaciones/descuentos de la venta actualizan `sales.total_amount`,
  que el cálculo usa en vivo — ya impactan.
- `delivery_documents.sale_id` vincula el remito real; su PDF es
  `/api/pdfs/deliveries/{id}`.
- `normalizePhoneForWhatsapp` (lib/order-confirmation.ts) y el patrón wa.me
  ya existen para la confirmación de pedidos. `clients.phone` disponible.
- Los componentes de `components/ui` son presentacionales puros (usables en
  client components).

## Cambios

### 1. `lib/collections.ts`

**Fórmula de saldo** (en `listSalesToCollect`, `saleOutstandingBalance` y
los campos `saldo_actual`/`saldo_despues_aprobar` de
`listPendingCollections`, para que pantalla, validación y bandeja de
aprobación coincidan):

```
saldo = GREATEST(total_amount + ND − (créditos), 0)
ND    = SUM(debit)  FILTER (WHERE description ILIKE 'nota de debito%')
créditos = SUM(credit)   -- cobros aprobados + notas de crédito
```

**`listSalesToCollect` suma campos**:
- `phone` (`cli.phone`) — para wa.me.
- `deliveryDocumentId` (`LEFT JOIN LATERAL (SELECT id FROM
  delivery_documents dd WHERE dd.sale_id = v.id AND dd.empresa_id =
  v.empresa_id LIMIT 1)`).
- `overdueDays` (`GREATEST((CURRENT_DATE - vencimiento), 0)::int`).

### 2. `lib/collection-order.ts` (nuevo, función pura)

```ts
export type CollectionOrderInput = {
  customerName: string;
  documentLabel: string;   // "Factura A" / "Remito" (desiredDocumentLabel)
  receiptNumber: number;
  amountLabel: string;     // formatCurrency(outstanding)
  dueDateLabel: string;    // formatDate(dueDate)
  overdueDays: number;     // 0 si no vencida
};
export function buildCollectionOrderMessage(input: CollectionOrderInput): string
```

Mensaje: saludo con nombre, identificación del comprobante y monto; si
`overdueDays > 0` indica "vencido hace N dias (vencimiento X)", si no "con
vencimiento el X"; solicitud de emitir el pago; aclaración de que se
adjunta el comprobante. El link final es
`https://wa.me/{phone}?text={encodeURIComponent(mensaje)}` armado en la
página con `normalizePhoneForWhatsapp`.

### 3. `app/collections/register-collection-dialog.tsx` (nuevo, client)

`"use client"` — recibe por props: `saleId`, `customerName`,
`receiptLabel`, `outstandingAmount`, `today` y la server action
(`registerCollectionAction`). Renderiza el ítem de menú "Registrar pago";
al click abre un panel `position: fixed` centrado con backdrop oscuro
(`bg-black/40`), botones cerrar/cancelar, y el formulario (monto topado al
saldo, fecha, método, destino, operación, notas) que postea a la action y
cierra al enviar. `position: fixed` escapa del `overflow-hidden` de la
tabla, no la deforma.

### 4. `app/collections/page.tsx`

- **DOCUMENTO**: etiqueta + botón "PDF" con cadena
  `hasFiscalPdf → /api/pdfs/fiscal/sales/{id}` →
  `deliveryDocumentId → /api/pdfs/deliveries/{deliveryDocumentId}` →
  `/api/pdfs/orders/{id}/request`.
- **ACCIÓN**: `<details>` desplegable (patrón del registro de pedidos) con:
  - "Registrar pago" (el dialog) — solo si `canRegister` y no está en
    aprobación; si está en aprobación se muestra el badge "En aprobacion"
    con el monto registrado.
  - "Emitir orden de cobro" — `<a target="_blank">` al wa.me armado; si el
    cliente no tiene teléfono usable, texto deshabilitado "Sin telefono".
- Se elimina la fila secundaria "Registrar cobro" (la reemplaza el modal).

## Manejo de errores / bordes

- Venta sin teléfono de cliente: ítem "Sin telefono" (no link).
- Venta con ND que supera lo cobrado: el saldo sube; el tope del form
  acompaña porque usa el mismo cálculo.
- ND/NC manuales futuras: mientras respeten el prefijo de descripción
  actual de fiscal.ts, entran en la fórmula.
- Carrera de doble registro: sin cambios, `registerCollection` valida
  estados y saldo bajo lock.

## Testing / verificación

`static.test.mjs` (test "collections screen…" existente):
- lib: `nota de debito%`, `phone`, `delivery_documents`, `overdueDays`.
- page: `Registrar pago`, `Emitir orden de cobro`, `wa.me` (vía lib),
  `/api/pdfs/deliveries/`, cadena fiscal→remito→solicitud; ya no exige la
  fila "Registrar cobro".
- nuevo lib `collection-order`: mensaje con días de atraso y vencimiento.
- dialog: `"use client"`, `position` fija/backdrop, action por props.

Suite completa + `tsc` + `eslint`. Verificación funcional en producción
tras deploy.

## Archivos afectados

- Editar: `apps/web/src/lib/collections.ts`
- Crear: `apps/web/src/lib/collection-order.ts`
- Crear: `apps/web/src/app/collections/register-collection-dialog.tsx`
- Editar: `apps/web/src/app/collections/page.tsx`
- Editar: `apps/web/scripts/static.test.mjs`
