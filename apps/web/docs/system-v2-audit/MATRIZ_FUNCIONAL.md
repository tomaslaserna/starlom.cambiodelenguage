# Matriz funcional: conservar, adaptar, rediseñar o retirar

## Prioridad definida por uso real

| Orden | Bloque | Tratamiento de migración | Protección requerida |
| ---: | --- | --- | --- |
| 1 | Administración + Finanzas | Sustitución completa por el bloque nuevo | Baja: uso actual nulo; validar únicamente consumidores indirectos |
| 2 | Compras + Proveedores | Sustitución funcional con importación histórica | Media: preservar stock, costos, facturas y deudas existentes |
| 3 | RR.HH. | Sustitución parcial | Alta sobre login, usuarios, permisos y sesiones; baja sobre funciones no utilizadas |
| 4 | CRM | Integración dentro de Comercial | Baja por uso; migrar leads, clientes y presupuestos existentes |
| 5 | Datos | Evolución de maestros | Media: migración completa de clientes, productos, precios y stock |
| 6 | Operaciones | Evolución sobre el módulo existente | Máxima: presupuestos, pedidos, entrega y facturación automática son críticos |
| 7 | Cobros y pagos | Migración paralela y conciliada | Máxima: no cambiar saldos ni imputaciones sin comparación por documento |
| 8 | Estética global | Homogeneización final | Aplicar cuando los bloques funcionales estén estabilizados |

Los bloqueos técnicos P0 siguen siendo obligatorios, pero no implican sustituir primero los menús de mayor uso. En Operaciones y Cobros/Pagos se corrigen en el lugar o detrás de adaptadores hasta que la versión sucesora demuestre paridad.

| Dominio actual | Decisión | Motivo | Destino V2 |
| --- | --- | --- | --- |
| Supabase Auth | Conservar y adaptar | Buen proveedor de identidad; falta consistencia transaccional con legajos | Identidad separada de Persona |
| Contexto por empresa y RLS | Conservar | Es una base sólida de aislamiento | Infraestructura transversal |
| Clientes + CRM clientes | Rediseñar y fusionar | Dos puertas para el mismo maestro | Comercial / Cliente 360 |
| Presupuestos + CRM presupuestos | Fusionar | Duplicación de navegación y estados | Comercial / Oportunidad y presupuesto |
| Ventas + Pedidos | Rediseñar y fusionar | Dos ciclos de vida para el mismo hecho | Operaciones / Pedido |
| Facturación automática al entregar | Adaptar | Reduce pasos; requiere outbox y reintentos | Operaciones + Control fiscal |
| Solicitudes y aprobaciones de factura | Retirar al completar migración | Se vuelve redundante en el flujo normal | Sólo excepciones en Control |
| Pagos / Cobranzas / CRM cobros | Rediseñar con prioridad P0 | Reglas incompatibles y asignación implícita | Comercial / Cobranza única |
| Cuentas corrientes | Conservar y endurecer | Concepto correcto; necesita ledger inmutable | Comercial / Estado de cuenta |
| Stock + Productos | Fusionar parcialmente | Producto y existencia son conceptos distintos, pero están fragmentados | Abastecimiento / Catálogo e inventario |
| Compras | Rediseñar | Mezcla orden, recepción, factura y pago | Abastecimiento / circuito en etapas |
| Proveedores | Rediseñar | Ficha insuficiente y proveedor único por producto | Abastecimiento / Proveedor 360 |
| Caja + Tesorería | Reemplazar primero | Uso actual nulo y varias lecturas sin conciliación canónica | Administración / Tesorería |
| Balance + Rentabilidad | Reemplazar primero | Uso actual nulo; consultas vivas no reproducibles | Administración / Cierres e informes |
| Métricas permanente | Retirar del menú | Ruido diario; valor mensual por rol | Informes programados |
| Empleados | Adaptar | Hoy administra acceso más que RR.HH. | Personas / Legajo e identidad |
| Remuneraciones | Rediseñar | Debe generar obligación y trazabilidad | Personas / Nómina |
| Auditoría | Conservar y ampliar | Esencial para correcciones | Control / Bitácora transversal |
| Laboratorio IA | Adaptar | Valioso, pero no garantiza respuesta final | Asistente con fallback y trazas |
| Portal de clientes | Conservar y adaptar | Buen autoservicio; requiere contexto de empresa y estados canónicos | Canal externo sobre APIs V2 |

## Rutas que no deben seguir coexistiendo como pares equivalentes

- `/customers` y `/crm/clientes`.
- `/quotes` y `/crm/presupuestos`.
- `/payments`, `/collections`, `/crm/cobros` y `/payments/accounts`.
- `/sales` y `/orders`.
- `/prices` y `/pricing`.
- `/balance`, `/rentabilidad`, `/metrics`, `/cash` y `/treasury/*` como tableros inconexos.

Durante la transición pueden existir redirecciones o adaptadores, pero sólo una ruta debe aceptar nuevas operaciones.

## Dependencias críticas

| Capacidad | Depende de | Si falla |
| --- | --- | --- |
| Entrega | stock, cuenta corriente, documentos | pedido en excepción; reintento idempotente |
| Factura | ARCA, certificado, punto de venta | outbox pendiente; nunca duplicar |
| Cobro | cuenta corriente, tesorería | transacción revertida completa |
| Compra recibida | orden, stock, costo | recepción en borrador o excepción |
| Pago proveedor | obligación, tesorería | no modificar parcialmente |
| Nómina | ventas, plan salarial, asistencia | liquidación bloqueada y explicable |
| Cierre | todos los ledgers conciliados | no permitir cierre definitivo |
