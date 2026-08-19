# Cobros y Pagos — Cuenta corriente con saldo corrido

**Fecha:** 2026-08-18
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Alcance de esta etapa:** Clientes (cobros). Proveedores queda para una etapa posterior.

## Problema

El sistema de cobros actual es **factura-céntrico**: un cobro se registra contra un remito puntual y hay una regla dura — `el cobro no puede superar el saldo de esa venta` (`assertCollectionAmountWithinBalance` en `apps/web/src/lib/collections.ts`). Esto genera fricción cada vez que un cliente:

- paga de más (queda saldo a favor que el sistema no sabe representar),
- paga de menos (cobro parcial forzado sobre una venta),
- paga varios remitos juntos con una sola transferencia.

No existe el concepto de "cuenta del cliente"; hay una pila de facturas sueltas que se cobran una por una.

## Objetivo

Reorientar el sistema de cobros de factura-céntrico a **cuenta-céntrico con saldo corrido**:

- El cliente tiene **un saldo** único.
- Los remitos suman (debe), los pagos y devoluciones restan (haber).
- El saldo **flota**: pago de más → saldo a favor; pago de menos → sigue debiendo.
- La imputación de pagos a remitos es **automática e invisible** (FIFO, lo más viejo primero), solo usada por debajo del capó para calcular antigüedad de deuda.

La mayor parte de la infraestructura ya existe (`current_account_movements`, `payments`, bandeja de aprobaciones); este trabajo es de **reorientación**, no de construcción desde cero.

## Modelo de datos

Reusamos las tablas existentes.

### `current_account_movements` (fuente de verdad del saldo)
Ya contiene debe/haber por cliente. Sigue siendo el cálculo del saldo. Movimientos que la alimentan:
- **Remito entregado** → débito (ya lo hace `ensureSaleDebit`).
- **Cobro aprobado/registrado** → crédito.
- **Devolución / nota de crédito** → crédito.
- **Nota de débito** → débito.

El saldo de un cliente = `SUM(debit) - SUM(credit)` sobre sus movimientos. Saldo positivo = debe; negativo = saldo a favor.

### `payments` (diario de pagos)
Sigue registrando cada pago. **Cambio clave:**
- `sale_id` pasa a ser **opcional** (un pago ya no pertenece a una venta puntual; pertenece al cliente).
- Se elimina la validación contra el saldo de una venta individual (`assertCollectionAmountWithinBalance`). Un pago solo valida `monto > 0` y que el cliente exista.
- El crédito correspondiente entra a `current_account_movements` a nivel **cliente**, no venta.

### Campos `collection_*` sobre `sales`
Dejan de ser el mecanismo de cálculo de saldo. Se conservan únicamente para representar el **estado de un pago en el flujo de aprobación** (Registrado / Pendiente / Anulado). No se leen para computar el saldo de la cuenta.

## Navegación

Menú nuevo de nivel superior: **"Cobros y Pagos"**, con dos submenús.

| Submenú | Ruta (propuesta) | Reemplaza / reusa |
|---|---|---|
| Registro de Pagos | `/payments` (o `/collections` reutilizada) | Reemplaza la lógica factura-céntrica de `/collections` |
| Cuentas Corrientes | `/payments/accounts` | Vista nueva a nivel cliente sobre `current_account_movements` |

Se **retira** la pantalla de cobranza por remito de `/collections`.

Se **reusa** sin cambios de flujo:
- `/admin/approvals` ("Solicitudes y aprobaciones") — sigue aprobando los pagos pendientes como fuente `collection`. No se crea una bandeja nueva.
- `/treasury/current-accounts` — queda para proveedores; fuera de alcance de esta etapa.

Se **re-apunta**:
- `/crm/cobros` (vista del vendedor) lee el mismo saldo corrido, filtrado a los clientes del vendedor (guard `assertVendorOwnsSale` / equivalente a nivel cliente).

## Submenú 1: Registro de Pagos

Diario de todos los pagos/cobros.

**Columnas:** fecha, cliente, método, operación/referencia, quién cargó, monto, estado.

**Estados:**
- **Registrado** — impactó al saldo.
- **Pendiente** — cargado por un vendedor, esperando aprobación en `/admin/approvals`. Es un estado **informativo** en este diario; el Aprobar/Rechazar vive en la bandeja existente.
- **Anulado** — revertido; se muestra tachado.

**Alta de un pago** (dos entradas, mismo formulario):
1. Botón global **"+ Nuevo pago"** — se elige el cliente.
2. Botón **"+ Registrar pago"** dentro del estado de cuenta del cliente — cliente pre-cargado.

**Campos del formulario:** cliente, monto, fecha, método (los de `COLLECTION_METHODS`), destino/cuenta, operación/referencia (obligatoria según método, como hoy en `collectionMethodRequiresOperation`), notas.

**Flujo híbrido de aprobación:**
- Usuario **admin/jefe** (con permiso de cobranza global) → el pago entra **Registrado** e impacta al saldo al instante.
- Usuario **vendedor** (sin permiso global) → el pago entra **Pendiente**, aparece en `/admin/approvals`. Al aprobarse, pasa a Registrado e impacta al saldo. (Reusa `approveCollection` / `rejectCollection`, adaptados a nivel cuenta.)

**Anular un pago:** revierte su crédito en `current_account_movements` (movimiento compensatorio, no borrado físico). Deja rastro en `audit_log`.

## Submenú 2: Cuentas Corrientes

### Vista "cuentas abiertas"
Tabla de todos los clientes con saldo ≠ 0.

- **Columnas:** cliente, vendedor, último movimiento, saldo (rojo = debe, verde = a favor), y **aging**: Al día / Vencido +30 / +60 / +90 días.
- **Encabezado:** deuda total y total a favor.
- **Filtros:** buscar cliente, filtrar por vendedor, "solo con deuda".
- Clic en un cliente → su estado de cuenta.

### Estado de cuenta del cliente
Histórico con saldo corrido.

- **Encabezado:** nombre, CUIT, vendedor, saldo actual, botón "+ Registrar pago", botón "Exportar PDF".
- **Filtro de fechas** (Desde / Hasta).
- **Cuerpo:**
  - Primera fila **"Saldo anterior"**: el saldo acumulado de todos los movimientos **anteriores** a la fecha Desde (lo que quedó afuera del filtro). Evita mandarle info vieja al cliente sin perder la continuidad del número.
  - Filas de movimientos dentro del rango: remitos (debe), pagos (haber), devoluciones/NC (haber), notas de débito (debe). Cada fila recalcula la columna **Saldo**.
  - Fila final **"Saldo final del período"**.

### PDF
El mismo cuadro del estado de cuenta, con el filtro de fecha aplicado, exportable para enviar al cliente. Reusa la infraestructura de PDF existente (`apps/web/src/lib/pdf/`).

## Cálculo de antigüedad (aging)

Para bucketear el saldo por antigüedad con saldo corrido:

1. Se toman los débitos (remitos) impagos del cliente, ordenados del más viejo al más nuevo.
2. Se imputan los créditos (pagos + notas de crédito) contra esos débitos **FIFO** (lo más viejo primero). Esta imputación es **interna e invisible**: el usuario nunca elige contra qué remito va un pago.
3. El remanente impago de cada débito se ubica en un bucket según su fecha de vencimiento (`sale_date + COALESCE(source_payment_term_days, payment_term_days, 0)`): al día, +30, +60, +90.

El saldo mostrado siempre es el saldo corrido real; el aging es solo una descomposición de ese saldo por antigüedad.

## Fuera de alcance (etapas posteriores)

- **Proveedores** / pagos que hace la empresa (simétrico; el modelo queda listo para sumarlo).
- **Imputación manual** de un pago a un remito específico.

## Notas de implementación / riesgos

- **Compatibilidad con datos existentes:** los `payments` y `current_account_movements` ya cargados deben seguir cuadrando. El saldo por cliente debe dar igual antes y después del cambio (el débito por remito y el crédito por cobro ya existen; lo que cambia es cómo se dan de alta los nuevos pagos, no el histórico).
- **Regla eliminada:** al quitar `assertCollectionAmountWithinBalance`, hay que asegurarse de que ningún otro flujo dependa de que un cobro no supere el saldo de una venta.
- **`/crm/cobros`:** revisar que el re-apuntado a saldo corrido no rompa los guards de propiedad del vendedor.
- **`sale_id` opcional en `payments`:** revisar constraints/índices y cualquier query que asuma `sale_id` no nulo.
