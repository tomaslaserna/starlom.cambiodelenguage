# Ficha 360 de proveedores — Diseño

## Intención

Convertir `/suppliers` de un directorio básico en la puerta de entrada a una ficha operativa completa por proveedor. La ficha debe permitir entender quién es el proveedor, cómo contactarlo y pagarle, qué productos abastece, cuánto se le compra y qué deuda está pendiente, sin recorrer Compras, Productos y Tesorería por separado.

## Objetivos

- Abrir cada proveedor desde el listado en `/suppliers/[id]`.
- Mostrar en una sola pantalla identidad, datos fiscales, contacto, condiciones comerciales, logística, banco, productos, compras y saldo pendiente.
- Permitir editar todos los datos maestros desde la ficha a usuarios con permiso `proveedores.editar`.
- Trabajar únicamente con proveedores activos; la ficha no incorpora estados, filtros de inactivos ni reactivación.
- Mantener la lectura restringida a `proveedores.ver` y registrar cada edición en `audit_log`.
- Reutilizar `purchases`, `purchase_items`, `products`, `payments` y `current_account_movements`; no duplicar historial ni saldos.
- Conservar los proveedores y compras existentes durante la migración.

## No objetivos

- No crear múltiples contactos o múltiples cuentas bancarias por proveedor en esta versión.
- No incorporar un portal externo para proveedores.
- No permitir registrar pagos, compras o movimientos de stock desde la ficha; la ficha enlaza a los circuitos existentes.
- No recalcular ni corregir automáticamente deudas históricas.
- No cambiar la lógica de recepción de compras ni de aprobación de pagos.
- No administrar activación, inactivación o reactivación de proveedores desde la ficha.

## Enfoques considerados

### 1. Ficha básica sin ampliar el esquema

Usar solamente los campos existentes y agregar estadísticas, productos e historial. Es la opción más rápida, pero no permite registrar condición fiscal, localidad, logística o datos bancarios completos.

### 2. Ficha 360 integral con un registro maestro por proveedor — elegido

Ampliar `suppliers` con los datos esenciales que tienen una sola vigencia principal por proveedor y construir `/suppliers/[id]` sobre las relaciones existentes. Mantiene una edición simple, una sola fuente de verdad y cubre la operación actual sin introducir entidades innecesarias.

### 3. Modelo avanzado normalizado

Crear tablas `supplier_contacts` y `supplier_bank_accounts` para múltiples contactos y cuentas. Es flexible, pero agrega flujos de alta, baja, selección de cuenta principal y permisos que hoy no justifican su complejidad.

## Estado actual y restricciones

- `suppliers` ya contiene `display_name`, `legal_name`, `tax_id`, `email`, `phone`, `address`, `notes`, `active`, `rubric` y `payment_term_days`.
- La interfaz actual usa incorrectamente `legal_name` como “contacto”. La migración no reinterpretará automáticamente esos valores: se conservarán y la ficha los presentará como razón social hasta que sean revisados.
- Las compras y sus pagos ya se relacionan con `supplier_id`; el saldo operativo de cada compra es `GREATEST(total_amount - paid_amount, 0)`.
- Los productos actuales admiten un proveedor principal mediante `products.supplier_id`.
- La aplicación usa Next.js App Router, Server Components, Server Actions, PostgreSQL/Supabase y permisos por recurso/acción.
- Toda consulta y actualización debe filtrar por `empresa_id`.

## Modelo de datos

Se agregan a `suppliers` columnas opcionales con valores seguros para registros existentes:

- `contact_name text not null default ''`
- `fiscal_condition text not null default ''`
- `locality text not null default ''`
- `province text not null default ''`
- `delivery_lead_days integer not null default 0`, con rango `0..3650`
- `minimum_order_amount numeric(14,2) not null default 0`, no negativo
- `shipping_method text not null default ''`
- `bank_name text not null default ''`
- `bank_account_type text not null default ''`
- `bank_account_holder text not null default ''`
- `bank_account_identifier text not null default ''` para CBU/CVU
- `bank_alias text not null default ''`

No se guardan totales, cantidades de compras ni saldos dentro de `suppliers`: se calculan desde las tablas transaccionales para evitar divergencias.

## Lectura 360

Una función dedicada `getSupplierDetail360(companyId, supplierId)` devolverá:

- `supplier`: todos los datos maestros.
- `summary`:
  - total comprado: suma de compras recibidas;
  - cantidad de compras recibidas;
  - última compra por `purchase_date`;
  - saldo pendiente: suma de `GREATEST(total_amount - paid_amount, 0)` para compras recibidas;
  - plazo de pago configurado;
  - productos activos asociados.
- `products`: SKU, nombre, categoría, costo actual, presentación y estado activo.
- `purchases`: número, fecha, descripción, total, pagado, saldo, vencimiento, estado, IVA y estado de recepción, ordenadas de más reciente a más antigua.

Las compras pendientes no forman parte de “total comprado” ni de “cantidad de compras” hasta que se reciben. Los estados pendientes y cancelados pueden aparecer en el historial con su estado para mantener trazabilidad.

## Experiencia de usuario

### Listado `/suppliers`

- El nombre del proveedor pasa a ser un enlace a `/suppliers/[id]`.
- Se corrige el orden actual de las columnas “Rubro” y “Plazo”.
- Se mantiene el alta rápida existente con los campos esenciales; los datos fiscales, logísticos y bancarios se completan luego desde la ficha 360.

### Ficha `/suppliers/[id]`

1. Cabecera con nombre comercial, rubro, botón “Editar” y regreso a Proveedores.
2. Indicadores: total comprado, compras, saldo pendiente, última compra y productos asociados.
3. Tarjetas:
   - identidad y fiscal;
   - contacto y ubicación;
   - condiciones comerciales y logística;
   - cuenta bancaria;
   - notas.
4. Tabla de productos provistos con acceso al producto.
5. Historial de compras con acceso a la compra, monto, pago, saldo, vencimiento y estado.

Los campos vacíos se muestran como “Sin registrar”; los datos bancarios no se ocultan parcialmente porque la pantalla es interna y requiere permiso de lectura de proveedores.

## Edición

- Un panel/modal de edición se abre desde la ficha.
- El formulario agrupa los campos con la misma estructura visual de la ficha.
- Sólo usuarios con `proveedores.editar` ven y ejecutan la edición.
- `display_name` es obligatorio.
- Email se valida con el control HTML y en servidor se normaliza a minúsculas.
- CUIT se guarda sólo con dígitos cuando se informa y debe tener 11 dígitos.
- CBU/CVU se guarda sólo con dígitos cuando se informa y debe tener 22 dígitos.
- Días y compra mínima no pueden ser negativos.
- La actualización se realiza en una transacción y agrega `supplier.updated` a `audit_log` con valores anteriores y nuevos.
- La Server Action revalida `/suppliers` y `/suppliers/[id]` y vuelve a la ficha con una confirmación visible.

## Seguridad y permisos

- Lectura de ficha: `proveedores.ver`.
- Edición: `proveedores.editar`.
- No se agregan endpoints públicos ni acceso anónimo.
- Todas las consultas usan `empresa_id`; una ID perteneciente a otra empresa responde como no encontrada.
- Los datos bancarios nunca se incluyen en el listado general ni en búsquedas globales.

## Migración y compatibilidad

- La migración agrega columnas con valores por defecto, restricciones de rango e índices únicamente donde aporten búsqueda operativa.
- `legal_name` deja de mapearse a `contact`; pasa a mapearse a `legalName`.
- `contact_name` pasa a ser el contacto principal.
- Los proveedores actuales conservan todos sus valores; no se intenta adivinar si un `legal_name` histórico era realmente un contacto.
- Alta, edición API y formularios se actualizan en conjunto para que ningún flujo pierda campos.

## Manejo de errores y estados vacíos

- Proveedor inexistente o ajeno a la empresa: página 404.
- Proveedor inactivo: página 404, igual que en el circuito actual.
- Sin compras: indicadores en cero y estado vacío explicativo.
- Sin productos: tabla vacía con enlace al catálogo, sin crear asociaciones implícitas.
- Error de validación: el formulario conserva el contexto y muestra un mensaje concreto.
- Error de base: no se aplica una actualización parcial.

## Pruebas y verificación

- Pruebas de mapeo y validación de todos los campos nuevos.
- Pruebas de aislamiento por empresa y permisos de lectura/edición.
- Pruebas de agregados: compras canceladas, pagos parciales, proveedor sin actividad y fechas nulas.
- Prueba de auditoría de actualización.
- Pruebas de cableado de la página, enlaces y formulario.
- Compilación de producción y revisión visual en escritorio y móvil.
- Consulta de verificación posterior a la migración para confirmar que no cambió el número de proveedores ni sus relaciones con compras/productos.

## Decisiones delegadas al constructor

- División exacta de componentes visuales, respetando los componentes UI existentes.
- Cantidad inicial de filas visibles en productos y compras, siempre que exista acceso claro al resto.
- Mensajes menores de ayuda y estados vacíos, manteniendo el vocabulario del ERP.
