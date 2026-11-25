# Administración: preparación operativa

## Diseño y alcance
Continuación autorizada por el usuario: completar los próximos pasos sin alterar históricos. Reutilizar el circuito transaccional existente para sueldos; conservar provisiones como costo, sin convertirlas en pagos al empleado. Evitar una segunda pantalla de carga salarial. El importe a pagar requiere confirmación expresa y puede ser menor que la base mensual; una diferencia requiere explicación. Si existen pagos salariales anteriores, bloquear nueva programación hasta conciliación, sin inferir saldos.

## Plan de ejecución
- [x] Sueldos: programar importe confirmado, separar base/provisiones/cargas; bloquear duplicaciones con circuito anterior. Pruebas SQL de parcial, total, reintentos, permisos y preservación de costos.
- [x] Correcciones: anular obligaciones sin pagos; revertir pagos del circuito con motivo, fecha abierta y contramovimiento único. Para vinculaciones manuales, deshacer sólo vínculo. Nunca borrar históricos.
- [x] Cierre: revisar cobertura temporal, integridad y concurrencia; no presentar posición actual como patrimonio histórico.
- [x] Navegación: acceso único y preparación de carga con pendientes explícitos.
- [ ] Verificar tipos, pruebas y build; mostrar versión local completa antes de despliegue.

## Límites
No aplicar migraciones ni registrar pagos reales en esta etapa. La conciliación bancaria requiere extractos/arqueo; no inventar movimientos para cuadrar. La liquidación laboral/fiscal no se calcula automáticamente: el responsable confirma el monto.

## Verificación y alcance efectivo
- 35 pruebas dirigidas pasaron: pagos parciales, reintentos, duplicados, cuentas ajenas, anulación, reversión, desvinculación manual, conservación de costos, protección de meses posteriores cerrados.
- Navegador local: sueldo base 800000, obligación confirmada 750000, pago 300000 y reversión: pendiente vuelve a 750000, pago original conservado.
- Revisión independiente: corregidos efecto retroactivo sobre meses cerrados, doble lectura de obligaciones en proyección y selección de egresos revertidos como manuales.
- Sin escrituras en producción, sin aplicar migración, sin publicar.
- Las obligaciones salariales requieren liquidación confirmada; no son un liquidador laboral/fiscal. Pagos históricos detectados bloquean programación hasta conciliación.
- Cierre coordina costos y pagos de este circuito; otros módulos operativos (ventas/stock) conservan sus reglas actuales. No se reconstruye aquí patrimonio histórico: snapshot informa positionAsOf y la pantalla explica que es posición actual.
- El circuito salarial y de gastos ahora exige permiso de lectura de sueldos; las mutaciones salariales requieren escritura de sueldos además de permisos de obligaciones/tesorería.

## Puesta en producción posterior
Aplicar únicamente 20261125164631_administration_payment_lifecycle.sql antes del código. No ejecuta backfill ni cambios de importes. Conservar los hashes de costos/pagos/tesorería existentes antes y después. El código depende de columnas y tabla nuevas; no publicar sin migración. Revisar roles operativos con acceso a sueldos.
