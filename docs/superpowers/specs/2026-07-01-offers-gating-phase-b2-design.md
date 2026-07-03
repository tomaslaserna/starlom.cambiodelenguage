# Gating de ofertas por punto de equilibrio (Fase B.2) — Diseño

Fecha: 2026-07-01
Módulo: Comercial › Pedidos › Cargar pedido (`/orders/new`)

## Objetivo

Cerrar la visión de Ofertas: en "Cargar pedido", la **línea de oferta** de la
confirmación de WhatsApp (selector de ofertas vigentes + campo de texto) se
habilita **solo cuando la empresa alcanzó el punto de equilibrio del mes**. Si no,
se muestra un aviso con el faltante.

## Alcance (Fase B.2)

- Gatear toda la línea de oferta (selector + texto libre) según
  `getBreakEvenStatus(companyId, mes).reached` (motor ya construido en B.1).
- Aviso con el monto faltante cuando el PE no está alcanzado.

Fuera de alcance: cambiar el motor de PE; gatear el flujo de editar pedido
(`/orders/[id]/edit`), que conserva su campo manual (no computa PE).

## Comportamiento

- **PE alcanzado (`reached = true`):** comportamiento actual — selector de ofertas
  vigentes (si hay activas) + campo "Oferta (opcional)" editable.
- **PE no alcanzado (`reached = false`):** se ocultan el selector y el campo de
  texto; se muestra un aviso: *"🔒 Las ofertas se habilitan al alcanzar el punto de
  equilibrio del mes (faltan {monto})."* No se envían ofertas al cliente. La
  confirmación no lleva línea 💡 (el campo queda oculto y `offerText` vacío).

## Cambios

### 1. `src/app/orders/new/page.tsx`

- Importar `getBreakEvenStatus` (`@/lib/profitability`) y `currentMonth`
  (`@/lib/month-range`).
- Cargar el estado del PE junto con el resto (agregar al `Promise.all`):
  `getBreakEvenStatus(session.companyId, currentMonth())`.
- Derivar y pasar a `OrderEntryFields`:
  - `offersEnabled = status.reached`
  - `offersRemaining = status.remaining`
  - `offers = status.reached ? ofertasActivas.map(...) : []` (si no está alcanzado,
    no se mandan ofertas al cliente).

### 2. `src/app/orders/new/order-entry-fields.tsx`

- Agregar props opcionales `offersEnabled?: boolean` (default `true`) y
  `offersRemaining?: number` (default `0`) a `OrderEntryFieldsProps`.
- Recibirlas con default en la firma y pasarlas a `OrderConfirmationPreview`.
- Default `true` para que la pantalla de editar pedido (que no pasa estas props ni
  computa PE) conserve su campo de oferta manual.

### 3. `src/app/orders/new/order-confirmation-preview.tsx`

- Agregar props `offersEnabled: boolean` y `offersRemaining: number`.
- Envolver el bloque actual de oferta (el `<Select>` del picker + el `<Field>`
  "Oferta (opcional)") en una condición:
  - Si `offersEnabled`: render actual (picker guardado por `offers.length > 0` +
    campo de texto).
  - Si no: un aviso `<p>` con "🔒 Las ofertas se habilitan al alcanzar el punto de
    equilibrio del mes (faltan {formatCurrency(offersRemaining)})."
- No cambia la función pura `buildWhatsappConfirmation`. Con el campo oculto,
  `offerText` permanece `""` → sin línea 💡.

## Manejo de errores / bordes

- Mes sin costos fijos cargados → `fixedCosts = 0` → `reached = true` (cualquier
  margen ≥ 0 lo alcanza) → ofertas habilitadas. Coherente: si no cargaste costos,
  no hay barrera.
- `getBreakEvenStatus` falla → la página ya está protegida por auth; un error se
  propaga como en cualquier server component (no se introduce manejo especial).
- Editar pedido (`/orders/[id]/edit`) no pasa las props → `offersEnabled = true`
  por default → sin regresión (mantiene el campo manual, sin picker porque
  `offers = []`).

## Testing / verificación

- Sin lógica pura nueva → sin tests unitarios nuevos. La suite existente
  (`static.test.mjs` 12/12, `order-confirmation.test.mjs` 7/7, `month-range` 4/4)
  debe seguir verde.
- **Funcional (autenticado):**
  - Con PE **no alcanzado** (hay costo de $850k cargado en julio, margen ~0):
    "Cargar pedido" muestra el aviso 🔒 con el faltante y **no** muestra selector ni
    campo de oferta.
  - Con PE **alcanzado** (borrar temporalmente el costo → `fixedCosts = 0` →
    `reached = true`): reaparecen el selector de ofertas y el campo de texto.

## Archivos afectados

- Editar: `apps/web/src/app/orders/new/page.tsx`
- Editar: `apps/web/src/app/orders/new/order-entry-fields.tsx`
- Editar: `apps/web/src/app/orders/new/order-confirmation-preview.tsx`
