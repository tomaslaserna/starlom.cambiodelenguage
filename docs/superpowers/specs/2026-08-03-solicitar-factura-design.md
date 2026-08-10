# Solicitar Factura (pedido → aprobación → ARCA) — diseño

Fecha: 2026-08-03
Estado: aprobado (diseño). Punto 3 de la devolución del testeo en vivo.
Sigue a: `2026-08-03-comprobantes-ajustes-iva-design.md`.

## Problema

En `/orders`, el botón "Factura" hoy abre `/api/pdfs/orders/[id]/document`, que sin
CAE cae al "Pedido operativo" interno (incorrecto). El usuario quiere que ese botón
**solicite** la factura (va a Solicitudes y aprobaciones), y que recién al aprobarla
se emita en ARCA y quede imprimible — sin poder solicitarla dos veces.

## Constraints confirmados

- "Solicitar Factura" solo si el pedido está **entregado** y el cliente tiene datos
  fiscales completos (`hasCompleteFiscalData`: `tax_id` ≥ 8 dígitos + `fiscal_condition`).
- Al **aprobar** se emite factura real en ARCA (CAE). Irreversible.
- Idempotente: no se puede solicitar si hay una solicitud fiscal **pendiente** o si la
  venta ya está **aprobada** (CAE). Un **rechazo** libera el pedido para re-solicitar.
- Modificar es solo pre-entregado; no coincide con "entregado", así que **no** hace
  falta invalidar solicitudes al modificar. (Los cambios post-entrega van por Registro
  de ventas con NC/ND o notas de devolución/agregado — fuera de alcance.)
- Solicitar: cualquiera que ve el registro de pedidos (`ORDERS_READ`). Aprobar:
  admin/jefe (ya lo exige `resolveGenericApproval`).

## Enfoque: reutilizar `app_solicitudes` + `resolveGenericApproval`

La tabla genérica `app_solicitudes` y `resolveGenericApproval` ya despachan por
`metadata.action` (ej. `supplier_payment` ejecuta el pago al aprobar). Se agrega
`action: "fiscal_invoice"`. **No** se reintroduce `source: "fiscal"` (sigue siendo
source "request"), así que el guardrail que removió el flujo fiscal viejo sigue verde.

## Máquina de estados del botón (columna Acciones, por pedido)

| Condición | Botón | Icono | Acción |
|---|---|---|---|
| Entregado + `hasCompleteFiscalData` + no aprobada + sin solicitud pendiente | **Solicitar Factura** | `invoice` | `requestFiscalInvoiceAction` |
| Solicitud fiscal **pendiente** | **Factura Solicitada** | `clock` | ninguna (sin acción) |
| `fiscal_status = 'aprobado'` | **Factura** | `download` | abre `/api/pdfs/orders/[id]/document` (= factura fiscal real) |
| Rechazada / sin datos fiscales / no entregado | (según corresponda) | — | vuelve a "Solicitar Factura" o nada |

El botón "Factura" incondicional actual (solo `hasCompleteFiscalData`) se reemplaza por
esta máquina de estados.

## Flujo

1. **Solicitar Factura** → `requestSaleFiscalInvoice(session, saleId)`:
   - valida: venta entregada, `hasCompleteFiscalData`, `fiscal_status` ≠ 'aprobado';
   - `INSERT INTO app_solicitudes (tipo, titulo, detalle, monto, solicitante, estado,
     metadata, empresa_id) SELECT 'factura', …, 'pendiente', $meta::jsonb, $empresa
     WHERE NOT EXISTS (solicitud con action='fiscal_invoice' y saleId, estado='pendiente')`
     — `metadata = { action: "fiscal_invoice", saleId }`.
2. Aparece en **Solicitudes y aprobaciones** (source "request", ya listado por
   `listPendingApprovalRequests`).
3. Admin/jefe **aprueba** → `resolveGenericApproval` detecta
   `metadata.action === "fiscal_invoice"` → `authorizeSaleFiscalDocument(session, saleId)`
   → ARCA → CAE → `fiscal_status = 'aprobado'`. `authorizeSaleFiscalDocument` ya es
   idempotente (no reemite si ya hay CAE). Si ARCA falla, lanza → la solicitud queda
   'pendiente' y el error se muestra al aprobador (reintentable).
4. Aprobada, la factura se imprime desde el pedido ("Factura"), la pantalla Fiscal (ya
   la lista) y/o aprobaciones.

## Cambios por archivo

- `src/lib/fiscal.ts`: `requestSaleFiscalInvoice(session, saleId)` — validaciones +
  INSERT idempotente en `app_solicitudes`.
- `src/lib/approvals.ts`: en `resolveGenericApproval`, rama
  `metadata.action === "fiscal_invoice"` → `authorizeSaleFiscalDocument`. (import de
  fiscal.ts; cuidar ciclos — fiscal.ts no importa approvals.ts.)
- `src/lib/orders.ts`: `OrderSummary` gana `fiscalStatus: string` y
  `hasPendingFiscalRequest: boolean`; ambas queries (`listOrders`, `getOrder`) agregan
  `COALESCE(s.fiscal_status,'no_enviado') AS fiscal_status` y un `EXISTS(... app_solicitudes
  ... action='fiscal_invoice' ... saleId = s.id ... estado='pendiente')` como
  `has_pending_fiscal_request`; `mapOrder` los mapea.
- `src/app/orders/actions.ts`: `requestFiscalInvoiceAction` (gate `ORDERS_READ`,
  revalida `/orders` y `/admin/approvals`).
- `src/app/orders/page.tsx`: máquina de 3 estados del botón, con iconos.
- `src/components/ui/app-icon.tsx`: agregar icono `download`.

## Testing

- Guardrails estáticos:
  - `fiscal.ts` exporta `requestSaleFiscalInvoice` con `INSERT … WHERE NOT EXISTS` y
    `action='fiscal_invoice'`;
  - `approvals.ts` maneja `metadata.action === "fiscal_invoice"` →
    `authorizeSaleFiscalDocument`;
  - `orders/page.tsx` tiene "Solicitar Factura", "Factura Solicitada", el icono `clock`
    y `download`;
  - `approvals.ts` sigue sin `source: "fiscal"` / `listPendingFiscalApprovals` (guardrail
    existente intacto).
- `npm test`, `tsc`, `eslint` limpios.

## Riesgos

- Aprobar emite factura fiscal real en ARCA. Idempotente y con manejo de fallo, pero la
  primera emisión real la valida el usuario en producción con cuidado.
- No se puede probar ARCA localmente; el build/deploy solo garantiza compilación.

## Fuera de alcance

- Notas de crédito/débito/devolución/agregado para cambios post-entrega.
- Cambios a los remitos (ya on-demand) o al registro de pedidos (acciones ya existen).
