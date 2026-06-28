# Backend Supabase Audit

Fecha: 2026-06-27

## Estado actual

El proyecto compila y levanta contra Supabase, pero el backend no esta completamente alineado con el esquema real de Supabase.

La base activa usa tablas nuevas en ingles:

- `profiles`
- `usuario_empresa`
- `empresas`
- `clients`
- `suppliers`
- `products`
- `quotes`
- `sales`
- `orders`
- `purchases`
- `payments`
- `current_account_movements`
- `stock_movements`
- `sale_documents`
- tablas auxiliares de items, importaciones, auditoria y permisos

El codigo todavia contiene consultas legacy a tablas en castellano que no existen en el schema actual de Supabase, por ejemplo:

- `clientes`
- `proveedores`
- `productos`
- `ventas`
- `detalle_ventas`
- `compras_registro`
- `detalle_compras_registro`
- `cuentas_corrientes`
- `pagos_registro`
- `presupuestos`
- `remitos`
- `mensajes`
- `recordatorios`
- `usuarios`
- `admin_*`

Mientras esas consultas no se migren o no se creen vistas/tablas de compatibilidad, varias rutas van a compilar pero pueden fallar en runtime.

## Cambios aplicados

- Auth principal migrado a Supabase Auth usando `profiles` y `usuario_empresa`.
- Registro publico deshabilitado.
- `AuthSession.userId` migrado de `number` a `string` para soportar UUID de Supabase.
- Rol `jefe` agregado al enum `user_role`.
- Columnas `username` y `title` agregadas en `profiles`.
- Permisos agregados:
  - `app_permissions`
  - `role_permissions`
  - `profile_permissions`
- Permisos base sembrados para admin, jefe y roles operativos.
- Creacion/edicion de empleados conectada a Supabase Auth Admin API.
- Pantalla `/employees` con formulario para cargo, usuario, contrasena, rango y ventanas habilitadas.
- Backend valida que jefe no pueda asignar permisos sensibles ni roles administrativos.
- Cache de lecturas cambiada a invalidacion por tabla detectada en SQL.
- Se revoco ejecucion publica de funciones `SECURITY DEFINER`:
  - `public.current_user_role()`
  - `public.is_admin()`
- Se agregaron indices para FKs nuevas en permisos.
- Upload de fotos de productos removido del flujo de productos.
- Navegacion duplicada por tabs superiores removida en las pantallas principales tocadas.

## Pendientes tecnicos

1. Variables necesarias
   - `STARLIM_SESSION_SECRET`: obligatorio fijo para sesiones.
   - `SUPABASE_SERVICE_ROLE_KEY`: obligatorio para crear/editar usuarios en Supabase Auth.

2. Migracion de consultas legacy
   - Hay que decidir si se migran los modulos al esquema ingles o si se crean vistas/tablas de compatibilidad.
   - Recomendacion: migrar codigo modulo por modulo al esquema real, no crear compatibilidad permanente.

3. RLS
   - Varias tablas tienen RLS habilitado sin policies. Eso mantiene Data API cerrada, pero falta definir politicas si se va a usar acceso directo desde cliente.
   - Como la app hoy usa backend con conexion Postgres, no conviene abrir policies genericas hasta cerrar matriz por rol.

4. Tests de flujo
   - Faltan tests reales para login, empleados/permisos, pedidos, cobros, compras, stock, presupuestos y permisos por endpoint.

5. Facturacion fiscal
   - El punto de integracion existe, pero ARCA/AFIP sigue en estado pendiente.

6. Observabilidad
   - Faltan logs estructurados, trazas de errores y metricas de DB.

7. Transacciones
   - Operaciones de cobros, cuenta corriente, stock, compras y pagos deben revisarse una por una para confirmar atomicidad.

## Informacion requerida

- `SUPABASE_SERVICE_ROLE_KEY` del proyecto Supabase nuevo.
- Confirmacion de si el esquema definitivo es el actual en ingles o si se debe preservar compatibilidad con nombres legacy en castellano.
- Usuario admin inicial a crear o vincular:
  - email
  - usuario
  - nombre visible
  - empresa
- Matriz final de permisos por rol, especialmente para diferenciar jefe, deposito, logistica, vendedor y operador.
- Decision sobre carga de comprobantes de compras: se quitaron fotos de productos, pero siguen existiendo comprobantes/recibos de compras.
