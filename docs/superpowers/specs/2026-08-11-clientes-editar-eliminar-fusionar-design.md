# Editar / Eliminar / Fusionar clientes — Diseño

**Fecha:** 2026-08-11
**Estado:** Aprobado, pendiente de plan de implementación

## Problema

En `/customers` (Base de datos → Clientes) la tabla es de **solo lectura**: cada
fila no tiene acciones. No se pueden **editar** los datos de un cliente ni
**eliminar** clientes cargados erróneamente o **repetidos**. No es un bug: la
función no está construida.

Estado actual verificado:
- `updateCustomer` (lib) y `PATCH /api/customers/[id]` **existen**, pero ningún
  botón de la UI los llama.
- **No hay** `deleteCustomer`, ni endpoint `DELETE`, ni UI de borrado.
- 6 tablas referencian `clients` por FK: `sales`, `orders`, `quotes`, `payments`,
  `current_account_movements`, `sale_documents`. Un cliente con historial en
  cualquiera de ellas no puede borrarse sin romper integridad.
- Producción: 167 clientes, 69 sin ventas.

## Decisiones (brainstorming)

- **Editar:** sí, en diálogo precargado. Permiso `clientes.editar` (ya lo tienen
  jefe y vendedor).
- **Eliminar:** solo si el cliente **no tiene historial** en las 6 tablas FK; si
  tiene, se bloquea con aviso.
- **Fusionar duplicados:** reasignar el historial del duplicado al cliente que se
  queda y luego borrar el duplicado.
- **Permiso de eliminar/fusionar:** nuevo `clientes.eliminar`, **solo administrador
  y jefe** (no vendedor).

## Componentes

### 1. Editar cliente
- Server action `updateCustomerAction(formData)` — `requireApiSession(clientes.editar)`,
  arma `customerInputFromBody` con los defaults del cliente actual (igual que el
  PATCH) y llama `updateCustomer`. `revalidatePath("/customers")`.
- UI: botón **"Editar"** por fila → diálogo (patrón `register-collection-dialog.tsx`)
  precargado con name, businessName, taxIdType, taxId, vatCondition, phone, address,
  city, province, priceList, status, seller, observation. Reutiliza el mismo layout
  del alta.

### 2. Eliminar (si no tiene historial)
- Lib `customerLinkCounts(companyId, id)` → cuenta filas del cliente en las 6
  tablas FK; devuelve `{ sales, orders, quotes, payments, movements, saleDocuments, total }`.
- Lib `deleteCustomer(companyId, id)` → si `total > 0` lanza
  `ApiError(409, "El cliente tiene historial (ventas/movimientos) y no puede eliminarse. Usá Fusionar.")`;
  si no, `DELETE FROM clients WHERE id = $1 AND empresa_id = $2`.
- Server action `deleteCustomerAction` — `requireApiSession(clientes.eliminar)`.
- UI: botón **"Eliminar"** por fila con confirmación (diálogo "¿Seguro? Esta acción
  no se puede deshacer"). Visible solo si la sesión tiene `clientes.eliminar`.

### 3. Fusionar duplicados
- Lib `mergeCustomers(companyId, keepId, duplicateId)` — en `withCompanyContext`
  (transacción):
  1. Valida `keepId != duplicateId` y que ambos existan en la empresa
     (si no, `ApiError`).
  2. Reasigna `client_id = keepId` donde `client_id = duplicateId` en
     `sales`, `orders`, `quotes`, `payments`, `current_account_movements`,
     `sale_documents`, scopeando por `empresa_id` en las tablas que tengan esa
     columna (el plan verifica cuáles la tienen antes de escribir cada UPDATE).
  3. `DELETE FROM clients WHERE id = duplicateId AND empresa_id`.
  - El cliente que se queda conserva sus datos; el duplicado desaparece.
- Server action `mergeCustomersAction` — `requireApiSession(clientes.eliminar)`.
- UI: botón **"Fusionar"** en el cliente duplicado → paso 1: buscar/elegir el
  cliente que se queda (selector con búsqueda); paso 2: confirmación con
  `customerLinkCounts(duplicateId)` ("se moverán N ventas, M movimientos… al
  cliente KEEPER y se eliminará DUPLICADO"). Visible solo con `clientes.eliminar`.

### 4. Permiso `clientes.eliminar`
- Nuevo permiso destructivo. Agregarlo donde el sistema resuelve permisos:
  - Mapa de roles en código `ROLE_PERMISSIONS` (`route-auth.ts`): agregar
    `clientes.eliminar` a `jefe` (administrador ya tiene `*`). No agregarlo a
    `vendedor`.
  - Si el sistema de permisos por base (`app_permissions`/`role_permissions`,
    patrón de `crm.ver` en `20260804000000_crm_vendors_phase1.sql`) es
    autoritativo, migración que inserta el permiso y lo otorga a `jefe`. El plan
    verifica cuál sistema aplica antes de decidir migración vs solo código.
- El resource/action para `requireApiSession`: `{ resource: "clientes", action: "eliminar" }`.

## Manejo de errores

- Editar: validación de `customerInputFromBody` (nombre obligatorio) → `ApiError(400)`.
- Eliminar con historial → `ApiError(409)` con mensaje claro que sugiere Fusionar.
- Fusionar con `keepId == duplicateId` o cliente inexistente → `ApiError(400/404)`.
- Todas las acciones scopeadas por `empresa_id`; un cliente de otra empresa se
  comporta como "no encontrado".

## Testing

- Unit (node:test, patrón `collection-methods.test.mjs` con mock client): 
  - `deleteCustomer` bloquea cuando `customerLinkCounts.total > 0` y borra cuando es 0.
  - `mergeCustomers` rechaza `keepId == duplicateId`; emite los UPDATE de reasignación
    sobre las 6 tablas y el DELETE final (verificando los `writes` del mock client).
- Regresión de fuente: `customers/page.tsx` incluye acciones por fila; el permiso
  `clientes.eliminar` está en el mapa de roles.
- Verificación viva (`/customers`) requiere login: se confirma en el deploy.

## Fuera de alcance (YAGNI)

- Deshacer una fusión (es irreversible; por eso la confirmación explícita).
- Fusión de más de dos clientes a la vez (se fusiona de a pares).
- Historial/auditoría de fusiones más allá de los datos ya reasignados.
- Detección automática de duplicados (el usuario elige cuáles fusionar).
- Editar campos que no expone `customerInputFromBody` (p. ej. `assigned_seller`
  se mantiene con su valor actual).
