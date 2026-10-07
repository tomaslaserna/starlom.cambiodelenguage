# Inventario del sistema actual

## 1. Superficies visibles

La navegación productiva declara ocho secciones principales: Inicio, CRM, Operaciones, Datos, Compras, Administración, RR.HH. y Cobros y pagos. Dentro de ellas aparecen, al menos, los siguientes recorridos:

| Área | Superficies observadas | Lectura |
| --- | --- | --- |
| Inicio | Escritorio, LA TIRRA, Calendario, Banco | Mezcla atención diaria, IA y enlaces auxiliares |
| CRM | Perfil, Clientes, Cobros, Leads, Presupuestos, Listas | Segundo mundo orientado a vendedores |
| Operaciones | Pedidos, Registro de ventas, Presupuestos, Fiscal | Pedido, venta y documento no tienen una única entrada |
| Datos | Precios, márgenes, ofertas, clientes, seguimiento, proveedores, stock | Maestros y operaciones están mezclados |
| Compras | Nueva compra, MRP, registro | Un módulo único cubre demasiadas etapas |
| Administración | Control, Resultados, Tesorería, Obligaciones, Patrimonio | Prototipo nuevo coexistiendo con Balance, Caja y Rentabilidad |
| RR.HH. | Empleados; remuneraciones vive bajo Balance | Acceso, legajo y pago separados por navegación, no por dominio |
| Cobros y pagos | Resumen, cuentas corrientes, pagos de tesorería | Clientes y proveedores comparten rótulo, pero no un ledger común |

## 2. Pares y grupos redundantes

### Cliente y comercial

- `/customers` administra clientes generales.
- `/crm/clientes` expone clientes al vendedor.
- `/customers/follow-up` agrega seguimiento fuera del CRM.
- `/quotes` y `/crm/presupuestos` modelan presupuestos desde contextos distintos.
- `/prices` y `/crm/listas` ofrecen listas de precios por circuitos diferentes.

### Pedido y venta

- `/orders` gestiona el ciclo del pedido.
- `/sales` conserva un registro de ventas con acciones superpuestas.
- `/billing` muestra el estado fiscal como una superficie separada.

### Cobranza y tesorería

- `/payments` resume cobranzas.
- `/payments/accounts` gestiona cuentas corrientes.
- `/crm/cobros` permite al vendedor registrar o consultar cobros.
- `/collections` permanece en código con reglas anteriores.
- `/treasury/movements?type=pago` registra egresos.

### Administración

- `/balance`, `/cash`, `/treasury/cash-flow`, `/treasury/accounts-payable`.
- `/administration` como nueva visión integrada.
- `/rentabilidad` como cálculo separado.
- `/metrics` todavía existe en el árbol aunque su retiro fue decidido funcionalmente.

## 3. Componentes de backend

| Componente | Responsabilidad observada | Riesgo de límite |
| --- | --- | --- |
| `customer-accounts.ts` | estado de cuenta, imputación, saldo a favor | convive con `collections.ts` |
| `collections.ts` | cobranza y aprobación anterior | limita pagos al saldo |
| `orders.ts` | alta, estados, entrega, stock, deuda y disparo fiscal | archivo muy concentrado |
| `sales-admin.ts` | edición y eliminación administrativa | borrado físico de efectos |
| `fiscal.ts` | autorización, notas y reconciliación ARCA | crítico y extenso; requiere tests contractuales |
| `purchases.ts` | compra, recepción, stock, deuda y pago | demasiadas etapas en un módulo |
| `catalog-management.ts` | productos, proveedores y catálogos | proveedor único heredado en producto |
| `employees.ts` | usuario Auth, empleado y permisos | llamada externa antes de transacción local |
| `accounts.ts` | movimientos y pagos | admite eliminaciones directas |
| `db.ts` | pool, empresa, transacción y caché | fortaleza a conservar |

## 4. Datos y migraciones

Se observan tres mecanismos históricos:

- `supabase/migrations/`: candidato recomendado como secuencia canónica.
- `migrations/`: scripts adicionales y documentación que en momentos lo trató como fuente principal.
- `supabase_migration.sql`: definición monolítica histórica.

Antes de crear nuevas tablas V2 se debe producir un manifiesto que indique, para cada migración:

- identificador y checksum;
- entorno donde fue aplicada;
- dependencia anterior;
- reversibilidad;
- dueño funcional;
- tablas y políticas afectadas.

## 5. Integraciones

| Integración | Uso | Situación |
| --- | --- | --- |
| Supabase Auth | usuarios y sesiones | útil, pero alta de empleado no es atómica con identidad |
| PostgreSQL/Supabase | fuente operativa | buen contexto por empresa; migraciones dispersas |
| ARCA WSFE | facturas y notas | reconciliación defensiva; falta orquestación durable |
| Mercado Pago | portal/tienda | variables requeridas no documentadas en `.env.example` |
| Resend | recordatorios de asistencia | automatización fija a una persona y empresa |
| Proveedor de IA | LA TIRRA | herramientas funcionan, síntesis final no garantizada |

## 6. Flujos actuales y puntos de corte

### Pedido facturado

1. el pedido guarda cliente, productos y tipo de comprobante;
2. la entrega valida stock y datos fiscales;
3. la transacción confirma entrega, stock y deuda;
4. fuera de la transacción se intenta ARCA;
5. si falla, el pedido queda entregado con error fiscal.

Punto de mejora: outbox durable entre 3 y 4.

### Cobro

1. el usuario entra por alguna de varias pantallas;
2. el flujo nuevo recibe aplicaciones explícitas o cae a comportamiento FIFO;
3. el flujo anterior limita el monto a la deuda;
4. el excedente nuevo puede registrarse como saldo a favor;
5. otras vistas aún muestran pagos no aplicados por separado.

Punto de mejora: una sola semántica y una sola API de escritura.

### Compra

1. se carga la compra y sus artículos;
2. según el camino, se puede actualizar proveedor, costo, stock y estado;
3. el pago puede materializar una obligación que antes no estaba registrada;
4. el importe se recorta al saldo restante.

Punto de mejora: separar cuatro documentos con identidades y fechas propias.

### Alta de empleado

1. se crea o modifica identidad en Supabase Auth;
2. luego se abre la transacción de datos internos;
3. se asocian rol y permisos;
4. Jefe/Administrador pueden recibir acceso global por atajo.

Punto de mejora: saga compensable para identidad y capacidades granulares.

## 7. Estado del prototipo

`/system-v2` implementa siete áreas coherentes con datos ficticios persistidos en el navegador. Es una herramienta de validación de interacción, no un backend alternativo. Sirve para acordar lenguaje, navegación e impactos antes de migrar tablas o rutas productivas.

La pantalla `/system-v2/audit` resume el dictamen y enlaza el plan de transición. Ninguna de las dos debe recibir datos reales hasta que exista un entorno de integración aislado.
