# Administración y Finanzas — contrato del prototipo

Este documento fija las decisiones funcionales del rediseño antes de conectarlo a producción. La demostración local usa datos ficticios persistidos en `localStorage`; no debe convertirse en una segunda fuente de verdad.

## Estructura aprobada

1. **Control**: resume caja, deudas, créditos y stock; prioriza excepciones y muestra si el mes está listo para cerrar.
2. **Resultados**: presenta ventas, costo de mercadería, margen, costos operativos y resultado. Los costos pueden ser fijos, variables o únicos.
3. **Tesorería**: conserva saldos operativos por cuenta, movimientos, conciliación y proyección de liquidez.
4. **Obligaciones**: reúne proveedores, sueldos, impuestos y costos pendientes; admite programación y pagos parciales o totales.
5. **Patrimonio**: calcula activos observables menos obligaciones y muestra concentración, cobertura y evolución.

## Reglas funcionales

- Un pago sólo afecta la obligación seleccionada y la cuenta de tesorería elegida.
- Programar un pago no disminuye caja; registrarlo sí.
- Los pagos parciales conservan saldo y trazabilidad. Si vencieron, mantienen prioridad de vencidos.
- La conciliación compara saldo operativo y saldo informado. Nunca crea un ajuste automático silencioso.
- Los costos tienen etiqueta `Fijo`, `Variable` o `Único`, importe editable, mes inicial y duración.
- Un costo indefinido nace activo en su primer mes y queda suspendido en los meses siguientes hasta ser confirmado.
- Registrar un costo y crear una obligación son decisiones relacionadas pero separadas: resultado económico y deuda no son lo mismo.
- Caja, resultado, deuda y patrimonio nunca se presentan como si fueran la misma métrica.
- El cierre mensual exige conciliación, obligaciones vencidas resueltas y costos indefinidos revisados.

## Fuente de cada dato en producción

| Dato | Fuente de verdad | Forma de carga |
| --- | --- | --- |
| Ventas brutas y netas | Pedidos entregados + comprobantes fiscales | Automática |
| Costo de mercadería | Movimientos de stock × costo vigente/histórico | Automática |
| Cuentas por cobrar | Libro mayor de cuentas corrientes | Automática |
| Stock valorizado | Inventario por depósito | Automática |
| Cuentas de tesorería | Saldos iniciales + movimientos aprobados | Mixta |
| Costos operativos | Definiciones y confirmaciones mensuales | Manual controlada |
| Obligaciones | Compras, costos, sueldos, impuestos y carga excepcional | Mixta |
| Patrimonio | Caja + créditos + stock − pasivos | Calculada |

## Modelo de datos propuesto

La adaptación productiva debería reutilizar tablas actuales cuando su semántica sea suficiente y crear sólo las piezas faltantes:

- `administration_cost_definitions`: concepto, etiqueta, importe, inicio, duración y estado.
- `administration_cost_periods`: inclusión/suspensión e importe efectivo por mes.
- `administration_obligations`: origen, beneficiario, documento, vencimiento, total y estado.
- `administration_obligation_payments`: imputación explícita entre obligación y movimiento de tesorería.
- `treasury_accounts`: cuenta, tipo y saldo inicial.
- `treasury_movements`: ingreso/egreso inmutable, fecha, cuenta, concepto y referencia de origen.
- `treasury_reconciliations`: saldo informado, diferencia, fecha y operador.
- `administration_monthly_snapshots`: resultado y patrimonio cerrados para conservar historia reproducible.

## Invariantes técnicas

- Toda fila debe estar aislada por empresa.
- Los importes se almacenan con precisión decimal; no con flotantes binarios.
- Los movimientos confirmados no se editan: se revierten con un movimiento compensatorio auditado.
- Las acciones deben ser idempotentes para evitar pagos u obligaciones duplicados.
- Una obligación puede tener muchos pagos; un pago puede imputarse sólo según la selección explícita del operador.
- El saldo operativo se calcula desde movimientos; el saldo informado pertenece a conciliación.
- Un cierre mensual genera una instantánea y bloquea modificaciones sin reapertura autorizada.

## Orden de adaptación posterior

1. Inventariar tablas y cálculos existentes y decidir qué se reutiliza.
2. Crear migraciones para costos, obligaciones, tesorería y cierres faltantes.
3. Conectar lecturas automáticas de ventas, cuentas corrientes y stock.
4. Migrar costos y deudas vigentes con conciliación inicial.
5. Reemplazar una pantalla del prototipo por vez detrás de permisos y validaciones.
6. Comparar durante un mes los totales nuevos contra los reportes actuales.
7. Cerrar las rutas antiguas sólo después de validar equivalencia y auditoría.
