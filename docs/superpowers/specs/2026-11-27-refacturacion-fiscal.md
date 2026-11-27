# Refacturación por cambio de razón social

## Objetivo y alcance autorizado

Permitir reemplazar comprobantes fiscales de una operación ya entregada por otros a un destinatario fiscal corregido, sin crear una venta, entrega, movimiento de stock, deuda o cobro adicionales. Aplicar posteriormente a seis facturas de noviembre de 2026 de PINAR EVENTOS, antes CLUB DE CAMPO SRL (CUIT 30717394832), ahora CORTEO S.R.L. (CUIT 30714850748). Motivo de cada NC: «Cambio de razón social».

| Original A | Fecha | Total |
|---|---|---:|
|0002-00000130|02/11/2026|500779.57|
|0002-00000131|03/11/2026|105222.48|
|0002-00000149|13/11/2026|864581.23|
|0002-00000150|13/11/2026|291806.63|
|0002-00000159|19/11/2026|176924.45|
|0002-00000168|26/11/2026|1020518.66|

Total 2959833.02. Volver a verificar antes de ejecutar: facturas aprobadas, mes fiscal efectivo, destinatario original, notas previas y ausencia de reemplazos existentes.

## Enfoque propuesto

Agregar un expediente de refacturación vinculado a la venta y al comprobante original. El expediente conserva ambos destinatarios fiscales, monto, IVA, detalle, motivo, usuario y autorizaciones. La factura original es inmutable; su número y CAE no se reemplazan ni se reutilizan. Los comprobantes nuevos reciben numeración y CAE propios mediante el proveedor ARCA actual.

La factura de reemplazo será un documento fiscal independiente asociado al expediente: no reutilizar el guardado de una única autorización en sales ni el emisor idempotente de la factura original. Los tres PDF usarán snapshots de razón social, CUIT, condición fiscal y detalle correspondientes a cada destinatario, sin leer retrospectivamente los datos mutables del cliente.

Alternativas descartadas: crear pedidos nuevos duplicaría la operación comercial; editar el CUIT o borrar el CAE del comprobante aprobado destruiría la trazabilidad. Recomendación: un flujo fiscal específico asociado a la venta original.

## Flujo y pantalla

1. Desde Fiscal, «Refacturar por cambio de razón social», disponible con el permiso fiscal existente.
2. Mostrar factura original, receptor original, nuevo receptor tomado de la ficha actual del cliente, importe, IVA y motivo obligatorio. Congelar esos datos al iniciar; cambios posteriores de ficha no alteran el expediente.
3. Prevalidar toda la operación antes de emitir: mismo cliente comercial, nuevo CUIT válido y diferente, condición fiscal y tipo compatibles, monto y detalle consistentes, sin cancelaciones ni ajustes previos incompatibles. Casos con NC parciales o pagos complejos se bloquean para conciliación explícita.
4. Emitir una NC total al receptor original, asociada al comprobante original y con «Cambio de razón social» en el comprobante/PDF de la nota.
5. Confirmar aprobación y persistencia de la NC antes de emitir una única factura de reemplazo a CORTEO. Conservar los importes y el tratamiento de IVA originales; no recalcular con listas de precios actuales. Usar la fecha fiscal permitida por el proveedor existente, sin alterar la fecha de entrega.
6. Mostrar el par NC/factura y su estado. Permitir descargar los tres comprobantes (original, NC y reemplazo).

## Invariantes comerciales y fiscales

- No invocar creación de pedido, confirmación de entrega, devolución física, descuento/reintegro de stock ni registro de cobro.
- Conservar venta, renglones, costos históricos, rentabilidad comercial, entrega, cuenta corriente, saldo, vencimientos y aplicaciones de pagos. El cliente comercial sigue siendo el mismo registro.
- Distinguir estas NC de una devolución/descuento comercial: el flujo actual de NC no puede contabilizar por su cuenta un crédito comercial adicional. El expediente tiene efecto fiscal y no modifica el saldo comercial.
- Usar una clasificación estructurada de refacturación, sin inferirla del texto del motivo. Excluir esos documentos de todos los ajustes comerciales, incluyendo ventas netas, rentabilidad, límites de notas posteriores y saldos, además de los movimientos de cuenta corriente.
- Registrar NC y factura de reemplazo en el libro fiscal del período de emisión; sus importes e IVA deben compensarse. El comprobante original permanece en su período y conserva sus datos originales.
- No tratar la factura de reemplazo como una venta adicional en reportes. La interfaz diferencia «original reemplazada» de «reemplazo vigente» y mantiene la cadena histórica.
- Rechazar cambios entre empresas y destinatarios no autorizados; utilizar el contexto de empresa y permisos existentes.

## Estados y recuperación

Estados mínimos: preparado, NC pendiente, NC aprobada, reemplazo pendiente, completado, revisión requerida. Guardar cada intento y sus referencias antes y después de contactar ARCA.

Con NC aprobada y reemplazo pendiente, mostrar «Refacturación incompleta»; no presentar la factura original como vigente y bloquear acciones fiscales incompatibles mientras se resuelve el expediente.

Restricciones únicas por factura original y por etapa del expediente, bloqueo para ejecución concurrente, y recuperación por consulta a ARCA tras timeouts. Reintentar nunca significa emitir otro comprobante si el anterior pudo quedar aprobado. Si se aprobó la NC y falla el reemplazo, conservar ese estado visible y reanudar únicamente la etapa pendiente. No revertir autorizaciones ni borrar evidencia.

## Validación y despliegue

Trabajar sobre rama aislada desde origin/main actualizado. Revisar las convenciones y migraciones del repositorio antes de implementar. Validar la migración, permisos, aislamiento entre empresas, inmutabilidad, PDF, precisión monetaria, conteos e IVA; incluir pruebas de aprobación, rechazo, timeout con aprobación remota, repetición, concurrencia, estados parciales y comprobantes ya ajustados.

Verificar con una operación de prueba que cantidades de movimientos de stock, entregas, ventas, cobros y saldos permanecen iguales antes/después. Ejecutar las pruebas fiscales, de cuenta corriente y reportes pertinentes. Preparar el cambio y sus resultados para revisión antes del despliegue; no emitir facturas reales como prueba.

Después de desplegar y verificar la función, volver a consultar las seis facturas y el CUIT de CORTEO. Procesarlas de manera secuencial y verificar cada par aprobado antes de avanzar. Entregar una conciliación con números y enlaces de originales, NC y reemplazos, motivo, importe, IVA y estado; verificar total 2959833.02 y saldos sin variación.

## Estado actual

Diseño preparado, pendiente de aprobación; no hay código de producto modificado ni documentos fiscales emitidos por esta tarea. La revisión de origin/main 05f51ac confirma que las facturas se guardan en sales y las notas en sales_internal_documents; markSaleFiscalNoteApproved genera movimientos de cuenta corriente. No existe aún un flujo específico de refacturación.

## Actualización autorizada 27/11/2026 durante implementación
La consulta directa detectó dos NC internas (no fiscales) en factura130, mercadería ya devuelta con stock/cuenta corriente ajustados: a82aa5a1-fab3-4997-ac2a-937cf00e1304 por118077 y09183b5f-5dd1-41cb-9b3f-c4f74af5a008 por2006.76. El usuario eligió explícitamente «Facturar el neto de $380.695,81». Por ello, exclusivamente para devoluciones internas inequívocamente conciliables, el modo neto permite NC fiscal total original500779.57 y factura nueva380695.81, conservando los ajustes comerciales existentes. Congelar IDs, importes y detalle de ambas devoluciones, quitar sus cantidades del detalle de reemplazo y bloquear cualquier devolución fiscal/ambigua/no aplicada. Las otras cinco facturas se reemplazan por su total original. El libro fiscal reflejará la reducción real de120083.76; la cuenta corriente no se modifica.
