# Preparación de datos de Administración

## Orden de trabajo
1. Elegir fecha de corte y un responsable. Exportar/resguardar los datos actuales antes de la conciliación.
2. Tesorería: extractos Santander y Mercado Pago (saldo de inicio, movimientos y saldo final), arqueo de efectivo y cheques pendientes identificados. Comparar movimientos existentes: vincular lo ya cargado; registrar únicamente diferencias comprobadas. Nunca ajustar por diferencia sin explicación.
3. Obligaciones de proveedores: comprobante, proveedor, fecha, vencimiento, total, pagos existentes, saldo confirmado. No modificar las entradas de stock para corregir deudas.
4. Sueldos: por empleado y mes, base mensual, importe efectivamente a pagar confirmado, anticipos/descuentos y pagos previos con cuenta y fecha. Provisión de aguinaldo y cargas son costos separados del pago al empleado. Si hay movimientos salariales antiguos, conciliar antes de programar en el circuito nuevo.
5. Gastos: confirmar/suspender los indefinidos del mes; programar vencimientos de los pendientes. Si ya se pagaron, vincular el egreso manual existente cuando coincida exactamente; no duplicar.
6. Guardar costos mensuales y revisar ventas con costo faltante y líneas de extractos sin conciliar. Cerrar sólo un mes finalizado y con fuentes revisadas.

## Controles antes de aceptar la carga
- Saldo de cada cuenta = saldo de apertura + ingresos - egresos, contrastado con extracto/arqueo.
- Cada pago tiene una referencia única; cada egreso manual sólo una imputación activa.
- Un costo se cuenta una sola vez en Resultados; su pago afecta caja y pendiente, no vuelve a sumar un costo.
- Pendiente de obligaciones = importe confirmado - pagos activos. Correcciones conservan original, motivo, fecha y usuario.
- No tratar caja, créditos o stock actuales como posición histórica del último día de un mes anterior. El informe marca la fecha de captura.

## Información aún necesaria
Extractos y arqueo; liquidaciones salariales confirmadas; estados de cuenta de proveedores. Sin esas fuentes puede verificarse el funcionamiento del software, pero no certificar la exactitud de los saldos reales.
