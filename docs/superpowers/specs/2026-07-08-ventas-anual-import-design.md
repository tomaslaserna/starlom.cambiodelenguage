# Carga puntual VENTAS ANUAL → sistema (Fase 1)

Fecha: 2026-07-08
Estado: aprobado (diseño), pendiente de vista previa

## Objetivo

Poner el sistema al día contra la hoja `VENTAS ANUAL` del Google Sheets
"REGISTRO DE VENTAS" (`1Ocl4Y9gcTS5LqNIePCebV3mtgYk7v6pa5Vy8uHDc75M`):

1. Insertar las ventas de la hoja que faltan en la tabla `sales`.
2. Registrar los cobros de las ventas que en la hoja figuran pagadas
   (columna J = PAGO) pero en el sistema siguen `pendiente`.

Es una **carga puntual** (script de sincronización que corro yo una vez),
no una herramienta repetible dentro de la app.

Fuera de alcance en esta fase (diferido a Fase 2): análisis de
ganancia/costo por venta, que requiere el detalle de artículos de la
hoja `SALIDAS`.

## Fuente y estado actual (al 2026-07-08)

- Hoja `VENTAS ANUAL`: 626 filas con fecha (ene–jul 2026).
- Sistema (`sales` con `source_sheet` = `...:VENTAS ANUAL`): 482 filas.
- Config canónica (`sales-source-sql.ts`): VENTAS ANUAL manda para fechas
  `< 2026-06-01` y `>= 2026-06-29`; junio 1–28 lo cubre ENTREGAS MACRO.

Columnas de la hoja (fila de datos): FECHA(A), OPERADOR(B), NRO REMITO(C),
NOMBRE(D), A COBRAR(E), VENDEDOR(F), PLAZO(G), FECHA DE COBRO(H),
COMPROBANTE(I), PAGO(J, booleano), REMITO(K).

## Clave de identificación (deduplicación)

El número de remito en la hoja cambia de formato: filas viejas traen el
número pelado (ej. `495`), filas nuevas traen `REM-2026-1046`. Un match
ingenuo por "todos los dígitos" produce falsos faltantes.

- **Clave = número de comprobante puro**: del valor de la hoja se extrae
  el número de secuencia (se quita el prefijo `REM-2026-` y los ceros a la
  izquierda; un número pelado queda igual) y se compara contra
  `sales.receipt_number` (y como respaldo, el número embebido en
  `sales.sale_number`).
- **Enero (39 filas) no tiene remito** en la hoja. Esas filas se
  identifican por su número de fila en la planilla (`source_row`), que es
  también la clave de deduplicación al insertarlas.

## Qué se importa y qué no

- Se cargan faltantes solo donde VENTAS ANUAL es la fuente canónica:
  enero–mayo, junio `>= 29`, y julio en adelante.
- **Junio 1–28 no se toca** (ENTREGAS MACRO ya lo tiene; importar VENTAS
  ANUAL de ese rango duplicaría ~85 ventas).
- Inserción de venta faltante en `sales`:
  - `source_sheet` = `...:VENTAS ANUAL`, `source_row` = fila de la planilla.
  - `sale_date`, `total_amount` (col E), `seller_name` (col F),
    `receipt_number` (secuencia del remito; null para enero),
    `sale_number` = `REM-2026-<n>` cuando hay remito.
  - `client_id`: se resuelve por nombre contra `clients`; si no matchea,
    queda `NULL` con `client_name` seteado (el sistema lo soporta).
  - `order_status` = `entregado`, `collection_status` según col J
    (`recibido` si pagada, `pendiente` si no).

## Cobros desfasados

Para cada venta que en la hoja está pagada (col J) pero en el sistema está
`pendiente`, se replica el efecto de "aprobar cobro":

- INSERT en `current_account_movements` con `credit` = total de la venta
  (crédito que baja el saldo del cliente), `sale_id`, `client_id`,
  `entity_type` correspondiente.
- UPDATE `sales.collection_status` = `recibido`.

Monto = total de la venta (cobro completo). Fecha de cobro = col H si está,
si no la fecha de la venta.

## Ejecución en dos tiempos

1. **Vista previa (solo lectura)**: script de reconciliación que NO escribe.
   Produce un reporte revisable:
   - Conteos: ventas a insertar, cobros a marcar.
   - CSV fila por fila de exactamente qué se insertaría y qué cobro se
     marcaría.
   - Marcado de anomalías: sin remito, remito duplicado en la hoja,
     cliente que no matchea, montos no numéricos o en cero.
   Se revisa junto al usuario.
2. **Escritura**: solo tras aprobación del reporte. Corre dentro de una
   transacción única (BEGIN/COMMIT; ROLLBACK ante cualquier error). Las
   filas marcadas como anómalas quedan excluidas hasta resolverlas.

## Seguridad

- Nada se escribe sin confirmación del usuario sobre el reporte de vista
  previa.
- Toda la escritura es transaccional.
- El script es idempotente: re-correrlo no duplica (dedupe por
  remito/`source_row` para inserciones; por `collection_status` actual para
  cobros).

## Testing

- Verificación de la lógica de normalización de remito (número puro) con
  casos: `495`, `495.0`, `REM-2026-0495`, `REM-2026-1046`, vacío.
- Vista previa contra producción (solo lectura) revisada manualmente antes
  de escribir.
- Post-escritura: reconteo hoja-vs-sistema por mes para confirmar cierre de
  la brecha.
