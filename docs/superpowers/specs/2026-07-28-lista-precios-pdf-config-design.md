# Lista de precios — export PDF configurable

**Fecha:** 2026-07-28
**Estado:** aprobado (diseño)

## Objetivo

Reemplazar el "Exportar PDF" simple de la lista de precios por un export
**configurable** que genera un PDF con formato de marca (según la plantilla
`Lista de Precios.dc.html` del zip provisto por el usuario).

## Configuración (panel al tocar "Exportar PDF")

Un `<details>` en `/prices` con un `<form method="GET" target="_blank"
action="/api/pdfs/pricing/price-list">` — al enviar, abre el PDF en pestaña
nueva con estos parámetros:

- `list` (hidden): id de la lista activa.
- `vigencia`: fecha (default hoy) → "Vigencia desde <fecha>".
- `stock`: `con` (solo con stock > 0) | `todos`.
- `groupBy`: `categoria` | `proveedor` → secciona el PDF por ese criterio.
- `filter` (opcional): texto; limita a categorías/proveedores que coincidan
  (según `groupBy`).
- `iva`: `21` | `10.5`.

## Reglas de IVA

Los precios de lista son **netos** (el sistema suma IVA aparte, confirmado en
`calculateQuoteTotals`). En el PDF:

- `iva=21` → precio × 1.21; leyenda "IVA incluido (21%)".
- `iva=10.5` → precio × 1.105; leyenda "IVA 10,5%".

La leyenda aparece visible en el encabezado del PDF.

## Formato del PDF (según el zip)

- Encabezado de marca (reusa `pdf.drawHeader`): empresa, título "Lista de
  precios", número = nombre de lista, fecha = vigencia, y la leyenda de IVA.
- **Secciones por grupo** (categoría o proveedor). Cada sección: subtítulo con el
  nombre del grupo y tabla con columnas **Código · Producto · Presentación ·
  Precio unit.** (Presentación = `products.unit`).
- Pie con leyenda ("Documento informativo no fiscal…").

## Datos

- Se extiende `buildPriceListPdf(companyId, options)`:
  - `options = { listId, vigencia, stock, groupBy, filter, iva }`.
  - Query: producto con precio neto por lista (como hoy: costo × multiplicador de
    la lista, fallback margen base), + `category`, proveedor (`suppliers.display_name`),
    `unit`, `sku/category_code`, y stock real (lateral sobre `stock_movements`).
  - Filtro de stock: `stock_real > 0` si `stock=con`.
  - Filtro opcional por categoría/proveedor según `groupBy`.
  - Orden: por grupo, luego por nombre.
  - Precio mostrado = neto × (1 + iva/100), redondeado a 2 decimales.
- El route `/api/pdfs/pricing/price-list` parsea los query params y llama al
  generador. Compatibilidad: si faltan params usa defaults (hoy, todos,
  categoría, iva 21).
- Sin cambios de esquema (usa columnas existentes: `unit`, `category`,
  `supplier_id`, `cost`, movimientos de stock).

## Testing

- **Unitario (`node --test`)**: helper puro de IVA (`applyVat(net, rate)`) y del
  parseo/normalización de opciones (stock/groupBy/iva/vigencia con defaults).
- **DB smoke test**: correr la query del PDF con groupBy categoría y proveedor,
  stock=con, iva=10.5, contra la base real (sin errores, precios y grupos
  coherentes).
- **Build**: `next build` por el cambio de route + generador.

## Fuera de alcance

- Igualar pixel a pixel el HTML (PDFKit ≠ HTML; se respeta estructura y datos).
- Guardar/recordar configuraciones de export.
- La feature de imagen de producto (en pausa, se retoma después).
