# Reglas de rendimiento de StarLim

Estas reglas aplican a toda funcionalidad nueva o modificación de una pantalla existente. La meta de uso normal en PC es que el cambio de módulo se perciba inmediato y que las pantallas operativas lleguen aproximadamente en un segundo cuando los datos requeridos estén disponibles.

## Antes de agregar una carga

1. Definir si el dato es imprescindible para mostrar la primera pantalla. Si no lo es, cargarlo después de que la interfaz sea interactiva.
2. Nunca descargar un catálogo completo para un selector. Usar búsqueda del lado servidor, límite explícito y pedir al usuario al menos dos caracteres cuando el catálogo sea grande.
3. Paginar registros e historiales. Una pantalla no debe traer todo el historial de la empresa.
4. Ejecutar en paralelo las consultas independientes con `Promise.all`. No encadenar consultas que no dependen entre sí.
5. Mantener permisos, empresa y RLS. No se permite ganar velocidad eliminando verificaciones de sesión, filtros de empresa o transacciones.

## Navegación compartida

- El shell no debe esperar badges, notificaciones ni datos accesorios antes de renderizar una ruta.
- Los indicadores del menú y avisos de mensajes se actualizan en segundo plano desde componentes cliente, con una sola consulta compartida por pantalla.
- Los enlaces internos deben conservar el prefetch al pasar el mouse o recibir foco.
- No agregar de nuevo una pantalla global de carga que tape el contenido durante toda una transición.

## Consultas y APIs

- Cada endpoint nuevo debe pedir sólo las columnas y filas que su pantalla necesita.
- Las consultas de búsqueda deben tener `LIMIT`, filtros por `empresa_id` y parámetros validados.
- Medir cambios que agreguen tablas grandes, agregaciones o joins: antes de publicar, comparar la ruta afectada en producción autenticada.
- Los datos que cambian con frecuencia se pueden refrescar en segundo plano; no se deben cachear de forma que oculten mensajes, permisos o movimientos nuevos.

## Control obligatorio antes de publicar

1. `npm run test`, `npm run lint`, TypeScript y build sin errores.
2. Probar la ruta modificada y una ruta distinta para comprobar que no se degradó el shell compartido.
3. Si una ruta supera aproximadamente un segundo de forma repetida, investigar consulta, cantidad de datos y serialización antes de sumar más UI.
4. Informar siempre el tiempo medido y qué datos se difirieron; no declarar una mejora sin una medición real.
