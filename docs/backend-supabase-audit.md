# Backend Supabase Audit

Fecha: 2026-06-28

## Estado actual

La app Next.js opera contra Supabase mediante conexion Postgres desde el servidor. El cliente web no usa la Data API ni expone `service_role`.

El esquema activo combina tablas nuevas en ingles con tablas administrativas heredadas que siguen siendo parte del sistema:

- Identidad y empresa: `profiles`, `usuario_empresa`, `empresas`.
- Negocio principal: `clients`, `suppliers`, `products`, `quotes`, `quote_items`, `sales`, `sale_items`, `purchases`, `purchase_items`.
- Finanzas y stock: `payments`, `current_account_movements`, `stock_movements`, `delivery_documents`, `sales_internal_documents`.
- Administracion y soporte: `app_permissions`, `role_permissions`, `profile_permissions`, `audit_log`, `eventos_integracion`, `mensajes`, `recordatorios`, `tareas_asignadas`, `admin_*`.

## Cambios aplicados

- Auth principal usando Supabase Auth, `profiles` y `usuario_empresa`.
- Registro publico deshabilitado.
- Roles normalizados para `administrador`, `jefe`, `deposito`, `logistica`, `operador` y `vendedor`.
- Creacion de empleados conectada a Supabase Auth Admin API.
- Jefe no puede crear administradores ni asignar permisos sensibles.
- Permisos legacy de `Jefe`/`Jefe1` ya no suman accesos economicos; la autorizacion evalua el rol normalizado.
- Permisos sensibles bloqueados para no-admin incluso si existiera una fila manual en `profile_permissions`.
- Alta/edicion/activacion de empleados limpia caches de permisos/menu; activar/desactivar queda en transaccion atomica.
- Permisos por endpoint y por pagina aplicados en modulos comerciales, financieros, compras, cobranzas, empleados, metricas y administracion.
- Menu lateral filtrado por permisos reales.
- Fallbacks de permisos de navegacion cerrados por defecto: si no se confirma permiso, no se muestra acceso.
- Cache de lecturas con invalidacion por tablas modificadas y limpieza explicita de cache de permisos/menu al cambiar empleados.
- Timeout de carga rapida ajustado a 250 ms para reducir pantallas falsamente vacias sin bloquear la navegacion.
- Precalentamiento manual de rutas eliminado; se evita disparar requests server-side en segundo plano que competian con la navegacion.
- API key interna y header de empresa eliminados de rutas activas.
- Upload de fotos de producto removido; solo quedan recibos/comprobantes de compras.
- Upload de imagenes valida extension, MIME, firma binaria y tamano.
- Importacion CSV valida extension, MIME, tamano maximo y cantidad maxima de filas.
- Presupuestos aceptados se convierten en pedidos de forma atomica.
- Stock de pedidos se descuenta con validacion de disponibilidad y lock transaccional.
- Pagos de proveedores impactan pago, compra y cuenta corriente en transaccion.
- Numeracion de pedidos y notas internas usa locks transaccionales para evitar duplicados.
- Errores API devuelven `requestId` y el log interno conserva correlacion sin exponer stack al cliente.
- Barrido de rutas API: endpoints privados protegidos con `requireApiSession` o `requireAdminApiSession`; logout, health y registro deshabilitado quedan como excepciones intencionales.
- Ruta residual `/balance/income-statement` eliminada; los datos quedan integrados en `Balance > Resumen`.
- Migracion `027` agregada para desactivar/eliminar el recurso administrativo viejo `admin.resultados` si existe en una base heredada.
- Tests locales `npm test` agregados para bloquear residuos de API key vieja, rutas removidas, fotos de producto y permisos legacy sensibles.
- Smoke HTTP `npm run test:smoke` agregado para login, sesion, endpoints privados, admin y usuario limitado cuando exista `.env.smoke`.
- Verificador `npm run env:check` agregado para variables obligatorias y variables peligrosas/obsoletas sin imprimir secretos.
- Usuario admin de smoke y usuario limitado creados en Supabase Auth/perfiles para validar accesos reales sobre la base nueva.
- Migracion `028` agregada y aplicada para crear tablas admin/finanzas compatibles con `profiles`: costos operativos, sueldos, dividendos, obligaciones fiscales y conciliacion bancaria.
- Smoke HTTP ejecutado contra `localhost:3400`: health, registro deshabilitado, privados sin sesion, login admin, dashboards criticos y bloqueo de metricas admin para usuario limitado.

## Pendientes tecnicos

1. Variables de produccion
   - `npm run env:check` valida el set local.
   - Falta correr la misma validacion contra variables reales de Vercel/deploy.

2. Tests de flujo
   - Existe smoke HTTP base y ya hay usuarios de prueba locales en `.env.smoke`.
   - Falta ampliar smoke a empleados/permisos, cobros, compras, stock y presupuestos.

3. RLS y Data API
   - La app no depende de Data API para operar.
   - Si luego se expone acceso directo desde cliente, hay que definir policies por tabla y rol antes de abrir permisos a `anon` o `authenticated`.

4. Facturacion fiscal
   - El punto de integracion existe, pero ARCA/CAE esta intencionalmente deshabilitado hasta implementar WSFEv1 real, manejo de errores, reintentos, auditoria y estados fiscales.

5. Observabilidad
   - Ya existe `requestId` en errores API.
   - Falta agregar metricas de DB, tiempos por query lenta y trazas centralizadas por modulo.

6. Auditoria funcional
   - Falta correr flujos reales con usuarios de cada rol sobre la base definitiva para confirmar matriz de permisos completa.

## Decisiones vigentes

- Mantener cache con invalidacion por modulo/tablas.
- No agregar fotos de productos.
- No simular CAE ni fiscalizacion si ARCA no esta conectado realmente.
- Mantener `tmp/` como artefacto local ignorado por Git para datos de carga y validacion.
