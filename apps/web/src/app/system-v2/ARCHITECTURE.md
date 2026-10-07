# Starlim Sistema V2 — arquitectura del gran prototipo

## Objetivo

Crear un sistema simple de operar y riguroso en sus efectos. El usuario trabaja sobre excepciones y decisiones; las consecuencias normales se generan automáticamente y con trazabilidad.

El prototipo vive en `/system-v2`, persiste datos ficticios en el navegador y no utiliza la base productiva.

## Navegación

La V2 reduce el sistema a siete áreas:

1. **Inicio**: prioridades, tareas y accesos contextuales.
2. **Comercial**: registro maestro de clientes, seguimiento y cobranzas.
3. **Operaciones**: pedidos, preparación, entrega y comprobantes.
4. **Abastecimiento**: proveedores, compras, inventario, costos y precios.
5. **Personas**: equipo, asistencia, remuneración y acceso.
6. **Administración**: tesorería, obligaciones, conciliación y patrimonio.
7. **Control**: excepciones fiscales, documentos, auditoría, cierre e informes.

No se crean secciones separadas para cada reporte o tabla. Las vistas de detalle aparecen dentro del circuito que las utiliza.

## Principios de producto

- **Registrar una vez**: cliente, proveedor, producto, empleado y documento tienen un registro maestro.
- **Imputación explícita**: cobros y pagos afectan sólo los documentos seleccionados.
- **Automatización visible**: antes de confirmar una acción se conoce qué módulos cambiarán.
- **Excepciones primero**: Inicio y Control muestran lo que requiere una decisión.
- **Sin borrado destructivo**: documentos con historia se anulan o revierten.
- **Cierre reproducible**: cada mes termina en una instantánea inmutable para informes.
- **Menú por rol**: cada persona ve áreas, acciones y datos relevantes para su trabajo.

## Circuitos implementados en el prototipo

### Pedido y entrega

`Cargado → Confirmado → Preparación → Reparto → Entregado`

Al entregar:

- se descuenta stock físico y reservado una sola vez;
- se genera el débito del cliente;
- Factura A/B queda preparada para autorización fiscal;
- Remito no crea factura;
- se evita duplicar un documento fiscal ya asociado al pedido.

### Compra y recepción

`Orden → Recepción → Factura del proveedor → Obligación → Pago`

- Crear la orden no modifica stock ni deuda.
- Recibir mercadería actualiza stock y costo.
- Si la factura todavía no llegó, la compra queda `Recibida sin factura`.
- Vincular la factura genera la obligación según el plazo del proveedor.
- El pago descuenta la cuenta elegida y crea un movimiento referenciado.

### Cobranza

- El cobro disminuye la deuda del cliente y aumenta Tesorería.
- Se admiten importes superiores a la deuda.
- El excedente queda como saldo a favor; no se distribuye silenciosamente.

### Remuneración

- Ventas por vendedor × tasa de comisión + sueldo base.
- La liquidación crea una obligación individual por empleado.
- El pago posterior ocurre desde Administración y queda en Tesorería.

### Control y cierre

El mes no está listo mientras existan:

- errores o documentos fiscales pendientes;
- diferencias de conciliación;
- tareas críticas abiertas;
- obligaciones vencidas.

Los informes por rol se generan desde el cierre, nunca desde cifras todavía cambiantes.

## Dominios y fuentes de verdad propuestas

| Dominio | Fuente de verdad |
| --- | --- |
| Identidad de cliente | `customers` + entidades legales y sucursales relacionadas |
| Proveedor | `suppliers` |
| Oferta de proveedor | relación muchos-a-muchos `supplier_products` |
| Producto | `products` |
| Existencia | suma de `stock_movements` por depósito |
| Pedido | `sales` y sus líneas |
| Compra | `purchases`, líneas y recepciones |
| Cuenta corriente | libro mayor de movimientos comerciales |
| Tesorería | cuentas + movimientos inmutables |
| Obligación | documento/origen + aplicaciones de pago |
| Documento fiscal | libro fiscal y respuesta de ARCA |
| Persona | legajo; el usuario de acceso es una relación separada |
| Resultado mensual | instantánea de cierre |

## Tablas nuevas o rediseñadas

- `customer_legal_entities`, `customer_branches`, `customer_contacts`.
- `supplier_contacts`, `supplier_bank_accounts`, `supplier_products`.
- `purchase_orders`, `purchase_order_items`, `purchase_receipts`, `purchase_receipt_items`.
- `supplier_invoices` y vínculos con recepciones.
- `treasury_accounts`, `treasury_movements`, `treasury_reconciliations`.
- `obligations`, `obligation_payment_allocations`.
- `employee_profiles`, `employee_attendance`, `employee_compensation_plans`, `payroll_periods`.
- `document_links` para adjuntar archivos a su entidad real.
- `monthly_closures`, `monthly_snapshots`, `monthly_reports`.

## Integraciones a conservar

- Autenticación Supabase y aislamiento por empresa.
- Permisos existentes, reorganizados por dominio.
- Motor fiscal y comunicación con ARCA.
- Libro mayor de cuentas corrientes.
- Movimientos auditables de stock.
- Generación actual de documentos PDF que tenga equivalencia funcional.

## Estrategia de migración

1. Congelar definiciones e invariantes del prototipo.
2. Inventariar tablas actuales y mapear cada campo a su nuevo dueño.
3. Crear migraciones aditivas; ninguna ruta productiva cambia todavía.
4. Migrar registros maestros y relaciones muchos-a-muchos.
5. Implementar circuitos detrás de una bandera por empresa.
6. Ejecutar ambos cálculos durante un mes y comparar totales.
7. Migrar una operación completa por vez.
8. Cerrar rutas viejas sólo cuando no tengan consumidores ni diferencias.
9. Generar la primera instantánea mensual y habilitar informes.
10. Retirar código y tablas obsoletas con respaldo y auditoría.

## Criterios de aceptación antes de producción

- No existe una acción que duplique stock, deuda, cobro o documento fiscal.
- Todo importe puede explicarse desde su documento y movimiento de origen.
- Se puede reconstruir caja, stock, cuenta corriente y patrimonio a una fecha.
- Los saldos de la V2 coinciden con los reportes canónicos del sistema actual.
- Cada rol completa su trabajo habitual sin acceder a pantallas irrelevantes.
- El recorrido principal de cada área se puede realizar sin instrucciones externas.
