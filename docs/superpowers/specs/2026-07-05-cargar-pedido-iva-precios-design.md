# Cargar pedido: menú unificado, IVA visual y precios en el mensaje — Diseño

Fecha: 2026-07-05
Módulo: Comercial (menú) y Comercial › Pedidos › Cargar pedido (`/orders/new`)

## Objetivo

Tres mejoras:

1. **Menú**: aplanar el grupo "Ventas" (hoy `Ventas › Registro de ventas`,
   redundante) en una única entrada "Registro de ventas".
2. **IVA visual** en Cargar pedido: selector Sin IVA / 21% / 10.5% que
   afecta solo lo que se muestra y se manda al cliente, no la base ni el
   cálculo fiscal.
3. **Precios opcionales en el mensaje** de WhatsApp: toggle que agrega
   precio por línea + resumen (Neto / IVA / Total).

Fuera de alcance (se hará después): descuento por defecto por lista de
precios — se resolverá como negociación al registrar la venta.

## Contexto técnico (ya existente)

- El selector de **lista de precios** ya existe en `order-entry-fields.tsx`
  (aparece al elegir cliente) con descuento manual por línea. No cambia.
- El IVA fiscal (21%) hoy se calcula recién al **confirmar/facturar** según
  el tipo de comprobante (`updateOrderStatus` en `lib/orders.ts`,
  `receiptAddsVat`). El total al cargar el pedido es el **neto**.
- `buildWhatsappConfirmation` (`lib/order-confirmation.ts`) arma el mensaje
  solo con `• cantidad x nombre`, sin precios.
- `order-confirmation-preview.tsx` (client) ya calcula el `wa.me` y tiene el
  campo de oferta; recibe las líneas por props desde `order-entry-fields`.
- El bloque de totales de `order-entry-fields.tsx` muestra hoy "Subtotal
  productos" y "Total", ambos = neto.

## Cambios

### 1. Menú — `lib/navigation.ts`

Reemplazar el grupo con items:
```ts
{ label: "Ventas", active: "sales", items: [
  { href: "/sales", label: "Registro de ventas", active: "sales", permission: SALES_READ_PERMISSION },
]},
```
por un grupo de link directo:
```ts
{ href: "/sales", label: "Registro de ventas", active: "sales", permission: SALES_READ_PERMISSION },
```
Y en `navigationSections`, sección "Comercial", cambiar
`groupByLabel("Ventas")` por `groupByLabel("Registro de ventas")`.

### 2. IVA visual — `lib/order-confirmation.ts` (lógica pura)

Agregar el tipo de tasa y helper:
```ts
export type IvaRate = 0 | 21 | 10.5;

export function ivaAmount(net: number, rate: IvaRate): number {
  return Math.round((net * (rate / 100) + Number.EPSILON) * 100) / 100;
}
```

Extender el input del mensaje (todo opcional para no romper llamadas
actuales):
```ts
export type ConfirmationPricedLine = {
  quantity: number;
  name: string;
  unitPrice: number;   // precio unitario de lista
  subtotal: number;    // ya con descuento de línea aplicado
};

type ConfirmationInput = {
  businessName: string;
  lines: ConfirmationLine[];       // cantidad + nombre (como hoy)
  deliveryLocation: string;
  deliveryDate: string;
  offerText?: string;
  showPrices?: boolean;            // default false
  pricedLines?: ConfirmationPricedLine[];
  ivaRate?: IvaRate;               // default 0
};
```

En `buildWhatsappConfirmation`, cuando `showPrices` es true y hay
`pricedLines`:
- cada renglón: `• cant x nombre — $unit (subtotal $sub)`
- bloque resumen al final:
  `Subtotal: $neto`; si `ivaRate > 0`: `IVA (21%/10.5%): $iva`;
  `Total: $totalConIva`.
Cuando `showPrices` es false, el mensaje queda **idéntico al actual**.

### 3. Order form — `app/orders/new/order-entry-fields.tsx`

- Nuevo estado `ivaRate: IvaRate` (default 0).
- En el bloque de totales, agregar un `Select` "IVA" (Sin IVA / 21% /
  10.5%) y mostrar:
  - "Subtotal neto" = `totalAmount` (como hoy).
  - "IVA (21%|10.5%)" = `ivaAmount(totalAmount, ivaRate)` — solo si
    `ivaRate > 0`.
  - "Total" = `totalAmount + ivaAmount(...)`.
- Pasar a `OrderConfirmationPreview` las nuevas props: `pricedLines`
  (unitPrice + subtotal por línea con cantidad > 0), `ivaRate`, y el neto.
- El IVA es estado de UI: **no** se agrega a `payload`, `productsJson` ni a
  ningún hidden que se persista. El pedido se sigue guardando en neto.

### 4. Preview — `app/orders/new/order-confirmation-preview.tsx`

- Nuevo estado `showPrices` (default false) con un checkbox/toggle
  "Mostrar precios al cliente".
- Recibir `pricedLines` e `ivaRate` por props y pasarlos a
  `buildWhatsappConfirmation` junto con `showPrices`.
- El `wa.me` y el botón Copiar usan el mismo `message` resultante.

## Manejo de errores / bordes

- Cliente sin teléfono: igual que hoy, botón WhatsApp deshabilitado.
- `showPrices` off: mensaje sin cambios respecto al actual (regresión cero).
- IVA 10.5% = 21% partido a la mitad; se implementa como tasa directa
  (`10.5`), no como "21/2", para claridad.
- Líneas sin producto o cantidad 0: no entran en `pricedLines` (mismo filtro
  que ya se usa para `lines`).

## Testing / verificación

`static.test.mjs`:
- Navegación: la sección "Comercial" referencia `groupByLabel("Registro de
  ventas")`; existe `href: "/sales", label: "Registro de ventas"` como grupo
  de link directo; ya no existe el grupo con `label: "Ventas"` con items.
- `order-confirmation.ts`: exporta `ivaAmount` y `IvaRate`; el builder
  contempla `showPrices`/`pricedLines`/`ivaRate`.
- `order-entry-fields.tsx`: contiene el `Select` de IVA (`10.5`, `21`) y
  "Subtotal neto"/"Total".
- `order-confirmation-preview.tsx`: contiene el toggle "Mostrar precios" y
  pasa `showPrices`.

Suite completa + `tsc` + `eslint`. Verificación funcional en el preview
local (`localhost:3000`): cargar un pedido, elegir IVA, activar precios y
ver el mensaje.

## Archivos afectados

- Editar: `apps/web/src/lib/navigation.ts`
- Editar: `apps/web/src/lib/order-confirmation.ts`
- Editar: `apps/web/src/app/orders/new/order-entry-fields.tsx`
- Editar: `apps/web/src/app/orders/new/order-confirmation-preview.tsx`
- Editar: `apps/web/scripts/static.test.mjs`
