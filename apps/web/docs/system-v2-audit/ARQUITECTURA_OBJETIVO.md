# Arquitectura objetivo del Sistema V2

## 1. Forma general

Se recomienda evolucionar el **monolito modular** actual en Next.js/PostgreSQL. No se propone empezar de cero ni reemplazar indiscriminadamente módulos que ya resuelven el negocio. Starlim no necesita microservicios: necesita límites de dominio claros, transacciones confiables y menos caminos alternativos.

La arquitectura objetivo se construye alrededor del código actual mediante adaptadores. Durante la transición, los módulos existentes continúan operando mientras cada dominio obtiene una entrada canónica. Las reglas útiles se extraen, se prueban y luego se reutilizan; no se reescriben sólo por razones estéticas.

```text
Interfaz por rol
    ↓
Casos de uso / comandos
    ↓
Servicios de dominio
    ↓
Repositorios y ledgers PostgreSQL
    ↓
Outbox durable → ARCA / Mercado Pago / correo / notificaciones
```

Cada comando debe:

1. validar permiso y empresa;
2. validar invariantes;
3. bloquear los agregados afectados;
4. escribir hechos y auditoría en una transacción;
5. publicar eventos mediante outbox;
6. devolver los efectos generados.

## 2. Dominios

### Comercial

- clientes, entidades legales, sucursales y contactos;
- oportunidades y presupuestos;
- acuerdos comerciales, listas y condiciones;
- cuentas corrientes y cobranzas.

### Operaciones

- pedidos y líneas;
- reserva, preparación, reparto y entrega;
- remitos y vínculo con documentos fiscales.

### Abastecimiento

- proveedores y ofertas por producto;
- órdenes de compra;
- recepciones parciales;
- facturas del proveedor;
- inventario y costo.

### Personas

- legajo;
- identidad de acceso;
- horario y asistencia;
- plan salarial, comisión y liquidación.

### Administración

- tesorería;
- obligaciones y pagos;
- conciliación bancaria;
- activos, pasivos y cierre mensual.

### Control

- fiscalidad;
- auditoría;
- excepciones;
- salud de integraciones;
- informes cerrados.

## 3. Modelo mínimo propuesto

### Maestros

- `customers`, `customer_legal_entities`, `customer_branches`, `customer_contacts`.
- `suppliers`, `supplier_contacts`, `supplier_bank_accounts`.
- `products`, `warehouses`, `supplier_products`.
- `people`, `employee_profiles`, `auth_identities`.

### Operaciones

- `orders`, `order_items`, `order_status_events`.
- `deliveries`, `delivery_items`, `document_links`.
- `purchase_orders`, `purchase_order_items`.
- `purchase_receipts`, `purchase_receipt_items`.
- `supplier_invoices`, `supplier_invoice_links`.

### Ledgers y aplicaciones

- `customer_ledger_entries`, `customer_payment_allocations`.
- `supplier_obligations`, `supplier_payment_allocations`.
- `stock_movements`.
- `treasury_accounts`, `treasury_movements`, `treasury_reconciliations`.

### Control

- `fiscal_documents`, `fiscal_attempts`.
- `outbox_events`, `integration_attempts`.
- `audit_events`.
- `monthly_closures`, `monthly_snapshots`, `monthly_reports`.

## 4. Invariantes de datos

- Todo registro con efecto económico tiene `empresa_id`, moneda, fecha efectiva y referencia de origen.
- Una entrega sólo descuenta stock una vez.
- Un documento fiscal posee una clave idempotente por empresa, tipo, punto de venta y operación de origen.
- Un pago no modifica una deuda; crea aplicaciones contra documentos seleccionados.
- El total aplicado nunca supera el pago; el remanente es crédito/anticipo explícito.
- Ningún saldo persistido se edita manualmente sin asiento compensatorio.
- Todo evento externo tiene estado, cantidad de intentos, próxima ejecución y último error.
- Un cierre mensual aprobado es inmutable; una corrección posterior pertenece al período siguiente.

## 5. Autorización

Formato sugerido de capacidad:

```text
commercial.customers.read
commercial.customers.manage
commercial.collections.register
commercial.collections.reverse
operations.orders.deliver
supply.receipts.confirm
administration.treasury.reconcile
control.fiscal.retry
people.compensation.approve
```

Cada concesión puede incluir alcance: empresa, sucursal, equipo o “propios”. Administrador y Jefe son conjuntos iniciales, no puertas maestras.

## 6. Integraciones

ARCA, Mercado Pago, correo y notificaciones no deben ejecutarse como una continuación frágil de la solicitud web. La transacción crea un evento outbox y un trabajador lo procesa con:

- clave de idempotencia;
- reintentos con backoff;
- reconciliación antes de repetir;
- registro de respuesta sanitizado;
- acción manual segura desde Control.

## 7. Observabilidad

Toda operación debe producir un `correlation_id` visible en errores y auditoría. Indicadores mínimos:

- eventos pendientes y fallidos por integración;
- documentos fiscales pendientes por antigüedad;
- diferencias de conciliación;
- ledgers desbalanceados;
- stock negativo o reservado por encima del disponible;
- duración y tasa de error de comandos críticos;
- consultas de IA sin respuesta final.

## 8. Rendimiento y mantenibilidad

- dividir módulos de más de 800 líneas por caso de uso y repositorio;
- evitar páginas que mezclen formulario, consulta, mutación y conciliación;
- índices compuestos comenzando por `empresa_id` en búsquedas multiempresa;
- paginación por cursor en bitácoras y movimientos;
- caché sólo para catálogos, nunca para saldos sin invalidación transaccional;
- contratos de tipos compartidos entre formulario, endpoint y dominio.
