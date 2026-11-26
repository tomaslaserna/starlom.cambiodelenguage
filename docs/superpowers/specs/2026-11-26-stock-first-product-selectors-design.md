# Selectores de productos con stock primero

## Intención

Simplificar la búsqueda operativa y comercial mostrando primero, entre las coincidencias de texto, los productos con existencias disponibles. Los productos sin stock siguen visibles y seleccionables, pero aparecen al final en gris con la indicación «Sin stock».

## Alcance

- Búsqueda y modificación de stock.
- Carga y edición de pedidos.
- Presupuestos.
- Ofertas y ajustes comerciales que usen el selector compartido.
- Nuevos selectores de productos que incorporen el metadato de disponibilidad.

## Excepción

Compras conserva el orden actual porque allí los productos agotados son precisamente candidatos prioritarios de reposición.

## Diseño

El componente compartido `SearchableSelect` aceptará metadatos opcionales de disponibilidad por opción. Primero se descartan las opciones que no coinciden; entre las coincidencias se agrupan antes los productos con stock y dentro de cada grupo se conserva la calidad de búsqueda. El límite visual se aplica al final. Las opciones sin stock usarán texto y fondo grises y mostrarán «Sin stock», sin bloquear su selección.

## Alternativas consideradas

- **Metadato compartido en el selector (elegida):** una sola regla visual y de orden para todos los flujos comerciales.
- Ordenar cada pantalla por separado: descartada por duplicar lógica y permitir divergencias.
- Ocultar o deshabilitar faltantes: descartada porque impediría cotizar, recibir consultas o preparar reposiciones futuras.

