# Ofertas — Fase 2 (aplicación en Cargar pedido)

**Fecha:** 2026-07-28
**Estado:** aprobado (diseño)

## Objetivo

Permitir aplicar una oferta/combo (de la Fase 1) al **cargar un pedido**
(`/orders/new`), de forma **manual**: el operador elige una oferta vigente y se
cargan sus artículos al precio de la oferta. Respeta la vigencia y el flag
"admite ofertas" de la lista. Presupuestos y límite de stock quedan fuera.

## Mecánica

Los pedidos se arman como líneas (producto + cantidad + **descuento %**; el
precio unitario sale de la lista activa). Una oferta se traduce a un **descuento
uniforme** por línea:

- Base = Σ (precio de lista del ítem en la lista activa × cantidad).
- Objetivo: `fijo` → `fixed_price`; `descuento` → `max(min_price ?? 0, base×(1−%/100))`.
- Objetivo se acota a `[0, base]` (las ofertas son descuentos, no recargos).
- Descuento por línea = `(1 − objetivo/base) × 100`, mismo % en todas las líneas.

Al elegir la oferta se **agregan** sus ítems como líneas nuevas con ese descuento;
el precio unitario lo sigue tomando de la lista (sin precios manuales).

## Lógica pura (`lib/offer-status.ts`, testeable)

- `offerLineDiscount(offer, baseTotal)` → % de descuento (0–100) a aplicar:
  - reusa `computeOfferPrice(baseTotal, offer)` como objetivo;
  - si `baseTotal <= 0` → 0; clamp del objetivo a `[0, baseTotal]`;
  - `(1 − objetivo/baseTotal) × 100`, redondeado a 2 decimales, clamp `[0,100]`.

## Datos

- La página `/orders/new` carga:
  - **Ofertas vigentes**: `listPriceOffers(companyId)` filtrado a `status === "vigente"`
    (traen `priceMode`, `fixed_price`, `discount_percent`, `min_price` y sus ítems
    `{productId, quantity}`).
  - **Listas que admiten ofertas**: `listPriceListParameters(companyId)` →
    nombres con `admitsOffers = true`.
- Ambos se pasan a `OrderEntryFields`. El precio de cada ítem para la lista activa
  se calcula en el cliente con los productos ya cargados (`priceForList`).

## UI (`order-entry-fields.tsx`)

- Botón **"Agregar oferta"** cerca del armador de líneas.
  - Habilitado solo si la **lista activa admite ofertas** y hay ofertas vigentes;
    si no, deshabilitado con una nota ("La lista actual no admite ofertas").
- Al abrir, muestra las ofertas vigentes (nombre + regla + ítems). Al elegir una:
  - calcula `baseTotal` y `offerLineDiscount`, y **agrega** cada ítem del combo
    como línea (`productId`, `quantity`, `discount`).
  - Si algún ítem del combo no está en el catálogo cargado, se omite con aviso.

## Testing

- **Unitario (`node --test`)**: `offerLineDiscount` (fijo, descuento, mínimo que
  pisa, base 0, objetivo > base → 0, clamp).
- **DB smoke test**: no aplica (la aplicación es en el cliente sobre datos ya
  cargados); se valida la carga de ofertas vigentes + nombres de listas que
  admiten ofertas con una consulta de lectura.
- **Build**: `next build`.
- **Manual autenticado**: cargar pedido con una lista que admite ofertas → agregar
  oferta → verificar que se cargan las líneas con el descuento correcto y el total
  coincide con la oferta.

## Fuera de alcance

Presupuestos (Fase 2b), límite de stock (contar usos/bloquear), detección
automática de combos, y aplicar en pedidos ya confirmados.
