# Precios — Fase 1: Reorganización + Lista de precios + Márgenes

**Fecha:** 2026-07-27
**Estado:** aprobado (diseño)

## Problema

El módulo de precios está disperso e incoherente: hay dos entradas de menú
(`/prices` para ver, `/pricing` para "todo junto") y `/pricing` mezcla cosas que
no son de precios (alta de producto, importar catálogo por CSV) con márgenes,
listas, rubros y multiplicadores. Es poco intuitivo, redundante y poco adaptable
para vender el sistema a otra empresa.

## Objetivo (Fase 1)

Reorganizar en un submenú **"Precios"** dentro de "Base de datos" con pantallas
limpias y dedicadas, **sin cambios de esquema**, reutilizando datos y lógica
existentes. Es la primera de tres fases (Fase 2: Parámetros; Fase 3: aplicación
en ventas).

## Alcance acordado

- Submenú **Precios** con: **Lista de precios**, **Márgenes**, **Nuevo
  producto**. (Parámetros llega en Fase 2.)
- **Lista de precios**: pestañas por lista + "+" para crear lista, buscador,
  tabla comercial (precio final) y **exportar a PDF lindo para el cliente**.
- **Márgenes**: tabla simple categoría + margen base (agregar/modificar).
- **Importar catálogo (CSV)** se mueve a **Stock** (sale de Precios).
- Se retira la página vieja `/pricing`.

## Navegación

En `lib/navigation.ts`, dentro de la sección "Base de datos", reemplazar los
ítems actuales de precios por un grupo **"Precios"** con submenús:

| Submenú | Ruta | Permiso |
|---|---|---|
| Lista de precios | `/prices` | `PRODUCTS_READ_PERMISSION` |
| Márgenes | `/prices/margins` | `PRODUCTS_READ_PERMISSION` |
| Nuevo producto | `/prices/new` | `PRODUCTS_CREATE_PERMISSION` |

- Quitar los ítems actuales: "Precios" (`/prices` suelto), "Margenes y listas"
  (`/pricing`), "Nuevo producto" (`/pricing?mode=new-product`), "Importar
  catalogo" (`/pricing?mode=bulk`).
- Agregar **"Importar catálogo"** en la sección **Stock** (`/stock?mode=bulk`,
  que ya existe), permiso `PRODUCTS_CREATE_PERMISSION`.

## Pantallas

### 1. Lista de precios (`/prices`)

Server component + client para pestañas/búsqueda.

- **Pestañas**: una por lista activa de `listas_precio` (orden por `orden`,
  `nombre`). La lista activa se maneja por query param (`?list=<id>`), server-
  rendered para que el PDF y la paginación funcionen sin estado cliente.
- **Botón "+"**: abre un input de nombre y crea la lista (alta en
  `listas_precio`, ya existe `priceListInputFromBody` + acción de creación).
- **Buscador**: por nombre de producto, código, categoría o proveedor (form GET,
  como en `/products`).
- **Tabla** (vista comercial): Producto · Código · Categoría · Proveedor ·
  **Precio de la lista activa**. Paginada.
  - Fuente de datos: extender `listSalePrices` (catalog.ts) para incluir
    `supplier` y filtrar/seleccionar el precio de la lista activa, o reutilizar
    `listProducts` que ya trae `supplier` y `prices[]` por lista. Elegir la que
    dé el precio por nombre de lista con menor cambio; no se toca el cálculo.
- **Exportar PDF** (botón): abre `/api/pdfs/pricing/price-list?list=<id>` en
  pestaña nueva (previsualización inline). Mejorar `buildPriceListPdf` para un
  formato **cliente**: encabezado con nombre de la empresa, título "Lista de
  precios — <nombre lista>", fecha de emisión, y tabla Producto · Precio limpia y
  legible. Sin costo ni margen.
- **Nuevo producto**: botón que lleva a `/prices/new`.

### 2. Márgenes (`/prices/margins`)

- Tabla: Categoría (`codigo` + `nombre`) · **Margen base** · acción editar.
- **Agregar**: form (código, nombre, margen base) → alta en `margenes`
  (`marginInputFromBody`, acción existente). El "margen base" se guarda en el
  campo base actual (`precio_1`); los demás campos (`precio_0/2/3`,
  `margen_minorista`) se preservan sin tocarlos en esta fase.
- **Modificar**: editar el margen base de una categoría (update parcial).
- No incluye multiplicadores por lista (eso es Parámetros, Fase 2).

### 3. Nuevo producto (`/prices/new`)

- Form de alta relocalizado desde `/pricing?mode=new-product`: nombre, código/SKU,
  categoría de precio (select de `margenes`), costo, proveedor. Usa
  `createProductAction` existente.

## Datos

**Sin migración.** Todo desde `margenes`, `listas_precio`, `margenes_listas`,
`products` y las funciones existentes (`listSalePrices`/`listProducts`,
`listMargins`, `buildPriceListPdf`, CRUD de `lib/pricing.ts`).

## Descomisionar `/pricing`

- La página `/pricing` deja de estar en el menú. Para no romper enlaces guardados,
  `/pricing` redirige a `/prices` (y `/pricing?mode=bulk` a `/stock?mode=bulk`,
  `?mode=new-product` a `/prices/new`).
- Las partes útiles de `/pricing` (alta de producto, márgenes) se trasladan a las
  nuevas pantallas; la gestión de listas/rubros/multiplicadores que no entra en
  Fase 1 se preserva a nivel datos y se retomará en Parámetros (Fase 2).

## Testing

- **Unitario (`node --test`)**: lógica pura nueva que aparezca (p. ej. helper que
  resuelve la lista activa a partir del query param y las listas disponibles;
  formateo del PDF si se extrae algo puro).
- **Manual autenticado**: navegar Precios → pestañas de listas, crear una lista,
  buscar, exportar PDF y verlo; agregar/editar un margen; alta de producto.
- Verificación de compilación con `next build` (además de `next dev`) por los
  cambios de rutas y "use server".

## Fuera de alcance (Fase 1)

Parámetros (piso, % entre listas, tope de descuento, "requiere autorización") y
su aplicación en ventas/presupuestos. Rediseño del modelo de márgenes
(multi-nivel) — se mantiene el esquema actual.
