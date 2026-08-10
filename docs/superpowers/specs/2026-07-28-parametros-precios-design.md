# Parámetros de precios (Fase 2)

**Fecha:** 2026-07-28
**Estado:** aprobado (diseño)

## Objetivo

Un submenú **Parámetros** donde se **crean y definen** las listas de precios: su
regla de cálculo (derivación), quién accede (roles) y sus reglas de uso. La
creación de listas se mueve acá; "Lista de precios" queda solo para ver/navegar.

## Alcance

- **Configurar** derivación + acceso por rol + reglas de uso.
- La **derivación SÍ afecta los precios ya** (recalcula multiplicadores).
- El acceso por rol y las reglas de uso se **guardan pero NO se aplican** en el
  circuito de ventas todavía (eso es Fase 3).

## Navegación

Agregar **Parámetros** al grupo Precios → `/prices/parameters` (permiso admin
para escribir; `PRODUCTS_READ_PERMISSION` para ver). Quitar el "+" de crear lista
de `/prices` (la creación vive en Parámetros).

## Datos (migración sobre `listas_precio`)

- `derivation_type TEXT NOT NULL DEFAULT 'costo'` CHECK IN ('costo','lista').
- `parent_list_id BIGINT` REFERENCES `listas_precio(id)` (nullable).
- `percentage NUMERIC NOT NULL DEFAULT 0` (puede ser negativo).
- `allowed_roles TEXT[]` (nullable; NULL/vacío = todos los roles).
- `valid_from DATE`, `valid_to DATE` (nullable).
- `requires_authorization BOOLEAN NOT NULL DEFAULT false`.
- `admits_offers BOOLEAN NOT NULL DEFAULT true`.
- `floor_factor NUMERIC` (nullable; piso = costo × factor).

## Motor de derivación (sin reescribir el cálculo)

- **Lógica pura** `lib/price-list-derivation.ts` (testeable): dadas las listas
  (id, type, parentId, percentage) y los márgenes base por categoría
  (`margenes.precio_1` por código), calcula el **multiplicador efectivo por
  (lista, categoría)** en orden topológico, con **detección de ciclos**:
  - `costo`: mult[cat] = margenBase[cat] × (1 + pct/100).
  - `lista`: mult[cat] = multPadre[cat] × (1 + pct/100).
- **Server** `recomputeListMultipliers(companyId)`: carga listas + márgenes,
  llama a la lógica pura, y hace upsert en `margenes_listas` (multiplicador por
  categoría por lista). Todo el resto (Lista de precios, PDF, pedidos,
  presupuestos) sigue leyendo `margenes_listas` → consistente.
- Se ejecuta al **guardar** parámetros de una lista y al **cambiar un margen
  base** (Márgenes). Botón "Recalcular" disponible.
- Validación al guardar: `parent_list_id` ≠ la propia lista; no se permite un
  ciclo (lo detecta la lógica pura).

## Pantalla `/prices/parameters`

- **Crear lista**: nombre + derivación (costo, o lista padre + %) + roles +
  vigencia + requiere autorización + admite ofertas + piso.
- **Tabla de listas** con su regla legible ("Costo" o "← <lista> +25%"), roles,
  vigencia y flags; **editar** por lista (form expandible con todos los params).
- Al guardar → recalcula. Solo admin escribe.
- Roles seleccionables: administrador, jefe, deposito, logistica, operador,
  vendedor (set del sistema).

## Testing

- **Unitario (`node --test`)**: `computeListMultipliers` (base, derivada, cadena,
  %, ciclo detectado) y el orden topológico.
- **DB smoke test**: aplicar una derivación (lista B = lista A + 25%), recalcular,
  y verificar que `margenes_listas` de B = A × 1.25 por categoría; y que un ciclo
  se rechaza.
- **Build**: `next build`.

## Fuera de alcance (Fase 3)

Aplicar en ventas: filtrar/bloquear por rol, exigir autorización, aplicar piso,
y el gate de ofertas por lista en pedidos/presupuestos.
