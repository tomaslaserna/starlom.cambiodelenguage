# Ofertas — Fase 1 (gestión)

**Fecha:** 2026-07-28
**Estado:** aprobado (diseño)

## Objetivo

Un submenú **Ofertas** para crear y administrar ofertas y **combos** (1 o más
artículos existentes) con reglas de precio, vigencia y stock. Solo **gestión**;
la aplicación en pedidos/presupuestos es la Fase 2.

## Modelo

Una oferta = un combo de 1+ ítems (producto + cantidad) con:
- **Precio** (`price_mode`):
  - `fijo`: un monto para todo el combo, igual en todas las listas.
  - `descuento`: un % sobre el precio de lista (varía por lista), con **mínimo
    opcional** (`min_price`, piso).
- **Vigencia**: `valid_from` / `valid_to` (sin `valid_to` = indefinida;
  `valid_from` futuro = programada).
- **Límite de stock**: `stock_limit` (opcional; vacío = ilimitado).
- **Estado** calculado (no se guarda): inactiva / programada / vigente / vencida.

## Datos (migración)

```
price_offers (
  id UUID PK DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  price_mode TEXT NOT NULL CHECK (price_mode IN ('fijo','descuento')),
  fixed_price NUMERIC,
  discount_percent NUMERIC,
  min_price NUMERIC,
  valid_from DATE,
  valid_to DATE,
  stock_limit INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)

price_offer_items (
  id BIGSERIAL PK,
  offer_id UUID NOT NULL REFERENCES price_offers(id) ON DELETE CASCADE,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0)
)
```

RLS por `empresa_id` (patrón `starlim_app` guardado) + índices por empresa/offer.

## Lógica pura (`lib/offer-status.ts`, testeable)

- `computeOfferStatus(active, validFrom, validTo, today)` →
  `inactiva | programada | vigente | vencida`.
- `computeOfferPrice(baseSum, { priceMode, fixedPrice, discountPercent, minPrice })`
  → precio de la oferta (para la previsualización y, luego, la Fase 2):
  - `fijo`: `fixedPrice`.
  - `descuento`: `max(minPrice ?? 0, baseSum × (1 − discount/100))`, redondeado.

## Servidor (`lib/price-offers.ts`)

- `listPriceOffers(companyId)` → ofertas con ítems (nombre/código de producto) y
  estado.
- `savePriceOffer(companyId, input)` → alta/edición de la oferta + sus ítems, en
  una transacción (borra e inserta ítems).
- `setPriceOfferActive(companyId, id, active)`.
- `deletePriceOffer(companyId, id)`.
- Validación: nombre, al menos 1 ítem, `fijo` requiere `fixed_price` > 0,
  `descuento` requiere `discount_percent` 0–100; `valid_to` ≥ `valid_from`.

## Pantalla `/prices/offers`

- **Crear oferta** (client component): nombre, **armador de combo** (buscar
  producto + cantidad, listar, quitar), modo de precio (fijo → monto; descuento →
  % + mínimo), vigencia (desde/hasta), límite de stock. Muestra el "precio
  regular" (suma de precios de la lista base) y el precio resultante como
  referencia.
- **Listado** de ofertas con badge de estado, resumen de ítems, regla de precio,
  y acciones editar / activar-desactivar / borrar. Solo admin escribe.

## Navegación

Agregar **Ofertas** al grupo Precios → `/prices/offers`
(`PRODUCTS_READ_PERMISSION` para ver). La oferta descriptiva actual
(`/pricing/offers`, texto para WhatsApp) queda intacta y separada.

## Testing

- **Unitario (`node --test`)**: `computeOfferStatus` (los 4 estados, bordes de
  fecha) y `computeOfferPrice` (fijo, descuento, mínimo que pisa).
- **DB smoke test**: crear una oferta con 2 ítems, releer con estado; validar que
  el borrado de ítems al editar funciona; rollback.
- **Build**: `next build`.

## Fuera de alcance (Fase 2)

Aplicar la oferta al cargar pedidos/presupuestos (respetando el flag "admite
ofertas" de cada lista), consumo real del límite de stock, y el gate por lista.
