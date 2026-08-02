# Flujo de comprobantes del pedido — diseño

Fecha: 2026-08-02
Estado: aprobado (diseño), pendiente de plan de implementación

## Problema

Hoy el pedido emite un único "comprobante operativo" (`buildOrderRequestPdf`,
"Pedido operativo", código PO, uso interno de depósito) que muestra columnas
Solic./Disp./Falta. No existe un **remito de cara al cliente sin precios**, y el
único remito con layout de cliente (`buildDeliveryPdf`) exige un registro
`delivery_documents` que solo se crea al entregar. Resultado: el operario ve "un
comprobante operativo con stock y nada más", y no hay separación entre el
comprobante comercial y el movimiento de stock.

## Objetivo

Separar los comprobantes del movimiento de stock y ordenar la secuencia:

1. **Al cargar el pedido** (o aprobar un presupuesto) → **REMITO SIN PRECIOS**
   (comprobante comercial), ligado al pedido, listo para imprimir/enviar/firmar.
   No toca stock ni marca entrega.
2. **Al despachar** (depósito confirma la mercadería) → **2ª copia del REMITO SIN
   PRECIOS** (sello "COPIA") para el chofer/cliente. Stock sigue reservado.
3. **Al final** → decidir **FACTURA** (venta en blanco, solo si el cliente tiene
   datos fiscales) **o REMITO CON PRECIOS** (venta en negro). Acá se **descuenta
   el stock** y se abre la cobranza (como hoy).

## Enfoque elegido (A): render on-demand, sin registro nuevo

El remito comercial se arma on-demand desde `sale_items`, sin crear un registro
`delivery_documents`. Esto mantiene separado el *remito comercial* del *remito
logístico* (delivery_documents sigue representando la entrega), no requiere
migración, y reusa el layout de remito existente.

Descartadas: **B** (registro persistente al cargar — ensucia la semántica de
`delivery_documents`, mete escritura en el camino caliente, y contradice "no marca
entrega") y **C** (híbrido — más partes móviles sin beneficio para este flujo).

## Roles de documento

| Documento | Builder | Disponible | Precios |
|---|---|---|---|
| **Remito sin precios** (comercial) | *nuevo* `buildOrderRemitoPdf(companyId, orderId, { includePrices:false, copia })` | desde `cargado` | No |
| **Remito con precios** (venta en negro) | mismo builder, `includePrices:true` | paso final | Sí |
| **Factura fiscal** (venta en blanco) | `buildFiscalSalePdf` (ya existe) | paso final, solo con datos fiscales | Sí (fiscal) |
| **Pedido operativo** (interno depósito) | `buildOrderRequestPdf` (**sin cambios**) | control interno | No |

- El remito comercial usa el **número comercial del pedido** (ya estable), no un
  número de remito nuevo.
- Original vs copia: parámetro `?copia=1` estampa "COPIA" en el encabezado. El
  contenido es idéntico (misma evidencia de mercadería).

## Ciclo de vida y stock

- **`cargado`** (cargar pedido / aprobar presupuesto): remito sin precios
  disponible (original y copia). Stock **reservado, no descontado**. Sin entrega.
- **`confirmado`** (depósito confirma): sin cambios de comprobante nuevos; la copia
  del remito sin precios sigue disponible. Stock reservado.
- **`entregado`** (final): se elige factura (si aplica) o remito con precios →
  **descuento de stock** + apertura de cobranza. Reusa el flujo confirmar→entregado
  existente (`confirmationDocument`, `discountSaleStockOnDelivery`).

## Gating por datos fiscales

- Helper `hasCompleteFiscalData(client)` → `true` si el cliente tiene **`tax_id`
  (CUIT) y `fiscal_condition`** no vacíos. (La razón social cae a `display_name`;
  no es parte del gate.)
- **Con** datos fiscales completos → el paso final ofrece **factura o remito con
  precios**.
- **Sin** datos fiscales → el paso final ofrece **solo remito con precios**; la
  opción de factura no aparece.

## Endpoints / UI

- **Nueva ruta**: `GET /api/pdfs/orders/[id]/remito?precios=no|si&copia=1`
  - `precios=no` (default) → `buildOrderRemitoPdf(..., includePrices:false)`
  - `precios=si` → `buildOrderRemitoPdf(..., includePrices:true)` (venta en negro)
  - `copia=1` → estampa "COPIA"
  - Permiso: `{ resource: "pedidos", action: "ver" }`.
- **Registro de pedidos** (`/orders`):
  - Botón **"Remito sin precios"** desde `cargado`.
  - Botón **"Copia (chofer)"** desde `cargado` (imprime con sello COPIA).
  - En el final: **Factura** (solo si `hasCompleteFiscalData`) y/o **Remito con
    precios**, según gating.
- **Aprobar presupuesto** (`acceptQuoteAndRemitAction`): se elimina el redirect a
  `/billing?tipo_factura=remito&created=remito`; el pedido queda en `cargado` con
  el remito sin precios disponible desde el registro de pedidos.

## Qué cambia / qué queda

- **Cambia**: nuevo `buildOrderRemitoPdf`; nueva ruta `/api/pdfs/orders/[id]/remito`;
  `acceptQuote`/acción de aprobación (quitar redirect a billing); UI de `/orders`
  (botones de comprobante por estado); enforcement del gating fiscal en el paso final.
- **Queda igual**: `buildOrderRequestPdf` (Pedido operativo interno);
  `buildDeliveryPdf`/`delivery_documents` (entrega logística); flujo
  confirmar→entregado y descuento de stock; `buildFiscalSalePdf`/ARCA.

## Testing

- **Guardrails estáticos** (`static.test.mjs`): existencia de los 4 roles de
  documento; ruta `/api/pdfs/orders/[id]/remito` con `precios`/`copia`; helper
  `hasCompleteFiscalData`; ausencia del redirect a `/billing` en la aprobación.
- **Domain-behavior** (`domain-behavior.test.mjs`):
  - remito sin precios disponible en `cargado`;
  - `buildOrderRemitoPdf(includePrices:false)` no muestra montos;
  - stock no se mueve hasta `entregado`;
  - factura solo ofrecida cuando `hasCompleteFiscalData` es `true`.

## Fuera de alcance (YAGNI)

- Número de remito persistente propio para el comprobante comercial (enfoque B).
- Materializar `delivery_documents` al despachar (enfoque C).
- Cambios al layout del Pedido operativo interno.
