# Ajustes al flujo de comprobantes — copia + IVA — diseño

Fecha: 2026-08-03
Estado: aprobado (diseño). Puntos 1 y 2 de la devolución del testeo en vivo.
Sigue a: `2026-08-02-flujo-comprobantes-pedido-design.md`.

## Contexto

Tras probar el flujo de comprobantes en producción, el usuario detectó tres cosas.
Este spec cubre **1 y 2** (rápidos, sin estado). El punto 3 ("Solicitar Factura" →
Solicitudes y aprobaciones → emisión ARCA al aprobar, idempotente) va en un ciclo
aparte por ser una feature con estado.

## Punto 1 — Sacar "Copia (chofer)"

El botón "Copia (chofer)" en `/orders` emite el mismo documento que "Remito sin
precios" (con un sello COPIA que no aporta valor). Se elimina el botón.

- `orders/page.tsx`: quitar el `<a>` "Copia (chofer)" (el que apunta a
  `/remito?copia=1`). Queda "Remito sin precios".
- El soporte `?copia=1` en la ruta y en `buildOrderRemitoPdf` se conserva (barato,
  sin UI) por si se reutiliza más adelante.

## Punto 2 — IVA en carga de pedidos + remito con precios

### 2a. Toggle "¿Lleva factura?" en carga de pedidos

Hoy la carga de pedidos tiene un selector de IVA de 3 opciones (Sin IVA / 21% /
10,5%) en `order-confirmation-preview.tsx`, que alimenta el `vatRate` persistido en
`sales.vat_rate`.

- Reemplazar ese `<select>` por un control **"¿Lleva factura?"** con dos opciones:
  - **Sí → 21%** (IVA discriminado de factura)
  - **No → 10,5%**
- Se **elimina la opción "Sin IVA" (0%)**: la regla del negocio es siempre 21 o 10,5.
- Default: **No (10,5%)** — el caso común (remito con precios). El estado inicial de
  `vatRate` en `order-entry-fields.tsx` pasa de `0` a `10.5`.
- El tipo `IvaRate = 0 | 21 | 10.5` se conserva (compatibilidad con ventas históricas
  con `vat_rate` 0); solo la UI deja de ofrecer 0.

### 2b. Remito con precios discrimina el IVA

Los precios del listado son **netos** (sin IVA); el IVA se suma **encima** (misma
convención que el mensaje de confirmación: `ivaAmount(net, rate) = net * rate/100`).

- `buildOrderRemitoPdf(..., { includePrices: true })`: además de las líneas a precio
  neto, al pie muestra:
  - **Subtotal** = suma de los importes netos de las líneas (`sale_items.total_amount`)
  - **IVA 21%/10,5%** = `subtotal * (vat_rate/100)`
  - **Total** = subtotal + IVA
- La tasa sale de `sales.vat_rate` (se agrega esa columna al SELECT del header). Si
  `vat_rate` es 0 (ventas históricas), el IVA sale 0 y Total = Subtotal.
- El remito **sin** precios no cambia (no muestra montos).

## Testing

- Actualizar guardrails estáticos que asumían el estado viejo:
  - quitar aserciones de "Copia (chofer)" / `copia=1` en el registro de pedidos;
  - en el preview de confirmación: quitar aserción de "Sin IVA"; agregar "¿Lleva
    factura?" y las opciones 21 / 10,5;
  - agregar aserción de que `buildOrderRemitoPdf` calcula Subtotal/IVA/Total.
- Suite `npm test` verde; `tsc` y `eslint` limpios en los archivos tocados.

## Deploy

Merge a `main` → auto-deploy de Vercel (proyecto `starlim`), monitoreando el build
hasta `success`, como en el ciclo anterior.

## Fuera de alcance

- Punto 3 (Solicitar Factura → aprobaciones → ARCA). Ciclo propio.
- Cambios al remito sin precios y al Pedido operativo interno.
