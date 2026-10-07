# Fase 1 — Administración y Finanzas

**Estado:** integrada al sistema actual; pendiente de despliegue y validación contra la base real.
**Fecha:** 7 de octubre de 2026.
**Producción:** sin cambios.

## Implementado

- Administración unificada en `/administration` con Control, Resultados, Tesorería, Obligaciones y Patrimonio.
- Lectura desde las fuentes actuales cuando existe conexión; datos ficticios persistentes como entorno local de prueba.
- Costos etiquetados como fijo, variable o único.
- Vigencia de 1 a 120 meses o indefinida.
- Costos indefinidos suspendidos al cambiar de mes hasta confirmación explícita.
- Edición, inclusión/suspensión mensual y archivo no destructivo.
- Registro manual de movimientos de tesorería.
- Registro de obligaciones manuales.
- Programación de pagos a compras pendientes desde Obligaciones.
- Rentabilidad acumulada desde el primer período con ventas hasta el mes consultado.
- Estado de conciliación bancaria por mes: cobertura, líneas pendientes/parciales e importe sin conciliar.
- Separación entre saldo operativo y extracto bancario: el extracto funciona como evidencia y ya no duplica caja.
- Condiciones explícitas de cierre: costos de venta completos, conciliación bancaria completa y costos indefinidos confirmados.
- Cierres gerenciales versionados con fotografía de resultado, caja, créditos, stock, obligaciones y evidencia.
- Reapertura no destructiva: conserva el cierre anterior y el siguiente cierre crea una versión nueva.
- Menú vigente reemplazado por un único bloque de Administración; Operaciones y Cobranzas no fueron modificados.
- Rutas antiguas redirigidas temporalmente a la vista nueva equivalente para permitir rollback seguro.
- Diagnóstico visible de acoplamiento histórico: ventas, pagos, cuentas corrientes, compras, productos, clientes, costos y extractos.
- Lectura financiera sin caché de módulo: cada apertura obtiene cifras actuales de la base.
- Alta de cuentas bancarias y carga manual inicial de líneas de extracto.
- Conciliación total o parcial contra cobros/pagos existentes, con control de saldo y bloqueo transaccional.
- Exclusión de movimientos no conciliables únicamente con motivo registrado; el extracto nunca crea movimientos contables.

## Modelo aditivo preparado

La migración `20261007124047_admin_finance_cost_schedules.sql` amplía `costos_operativos` sin eliminar columnas ni registros históricos y agrega el estado mensual de cada costo. La migración `20261007133630_admin_finance_monthly_closures.sql` agrega cierres versionados sin permiso de borrado para el runtime. Ambas incluyen aislamiento por empresa y RLS.

## Validación realizada

- once pruebas específicas de vigencia, cierre, reemplazo de rutas, acoplamiento histórico y conciliación: pasan;
- TypeScript: pasa;
- lint: pasa;
- Resultados, Tesorería y Obligaciones: HTTP 200 en localhost;
- build de producción: compila las 139 rutas correctamente;
- suite completa: 329 de 337 pruebas pasan; permanecen ocho fallos históricos ajenos a esta etapa y no se incorporaron regresiones nuevas.

## Activación con datos reales

- vincular este checkout con el proyecto Vercel o proveer un `.env.local` autorizado;
- aplicar primero en preview las migraciones aditivas de costos y cierres;
- validar Administrador/Jefe y el permiso específico de escritura de Tesorería;
- ejecutar la comparación automática y manual de totales contra producción antes del primer cierre;
- cargar las cuentas bancarias y comenzar el extracto del mes actual;
- desplegar manteniendo las redirecciones temporales durante el período de estabilización.

La historia operativa no se copia a tablas nuevas: las vistas consumen las fuentes actuales por `empresa_id`. Sólo la configuración administrativa nueva —programaciones, extractos, conciliaciones y cierres— se guarda en las tablas aditivas correspondientes.
