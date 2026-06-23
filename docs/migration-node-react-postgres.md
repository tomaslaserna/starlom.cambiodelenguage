# Migracion Node + React + PostgreSQL

## Objetivo

Migrar Star Lim de forma incremental, manteniendo el ERP PHP operativo mientras los modulos se reemplazan por una app Next.js con APIs Node/TypeScript y PostgreSQL/Supabase.

## Estructura inicial

- `apps/web`: nueva app Next.js App Router.
- `apps/web/src/app/api/health/route.ts`: primer endpoint Node para validar runtime y conexion PostgreSQL.
- `apps/web/src/app/api/customers/route.ts`: listado paginado de clientes.
- `apps/web/src/app/api/products/route.ts`: listado paginado de productos con stock disponible.
- `apps/web/src/app/api/suppliers/route.ts`: listado y alta de proveedores.
- `apps/web/src/app/api/*/[id]/route.ts`: detalle y edicion de clientes, productos y proveedores.
- `apps/web/src/app/api/orders/route.ts`: listado paginado de pedidos/ventas.
- `apps/web/src/app/api/orders/[id]/route.ts`: detalle de pedido con renglones.
- `apps/web/src/app/api/orders/[id]/status/route.ts`: avance del estado del pedido.
- `apps/web/src/app/api/orders/[id]/observation/route.ts`: edicion de observacion.
- `apps/web/src/app/api/orders/[id]/collection/route.ts`: estado de cobro simple.
- `apps/web/src/app/api/sales-documents/route.ts`: contexto de comprobantes y creacion de NC/ND internas.
- `apps/web/src/app/api/collections/*`: registro, aprobacion y rechazo de cobros.
- `apps/web/src/app/api/quotes/*`: seguimiento, alta, aceptacion y baja de presupuestos.
- `apps/web/src/app/api/deliveries/*`: repartidores y armado de reparto.
- `apps/web/src/app/api/purchases/*`: compras, detalle, estado, revision de paquete y pago proveedor.
- `apps/web/src/app/api/accounts/*`: cuentas corrientes manuales.
- `apps/web/src/app/api/payment-records/*`: registros manuales de cobros/pagos.
- `apps/web/src/app/api/admin/*`: metricas operativas, flujo de caja y cuentas por pagar.
- `apps/web/src/app/api/employees/*`: gestion basica de empleados, rangos, estado y permisos.
- `apps/web/src/app/api/pricing/*`: margenes, rubros, listas de precio y multiplicadores.
- `apps/web/src/app/api/imports/*`: importacion CSV de productos, clientes y codigos de producto.
- `apps/web/src/app/api/stock/*`: reconteo, alta de producto y actualizacion masiva de stock.
- `apps/web/src/app/api/stock/products/upload/route.ts`: alta de producto con imagen multipart subida a Supabase Storage.
- `apps/web/src/app/api/purchases/[id]/receipt-photo/route.ts`: carga de foto de recibo de compra a Supabase Storage.
- `apps/web/src/app/api/messages/*`: mensajeria interna.
- `apps/web/src/app/api/tasks/*`: recordatorios y tareas asignadas.
- `apps/web/src/app/api/customers/follow-up/route.ts`: seguimiento de recompra de clientes.
- `apps/web/src/app/api/sales-ledger/route.ts`: listado unificado de ventas/remitos.
- `apps/web/src/app/api/sales-records/field/route.ts`: edicion controlada de campos de venta/remito.
- `apps/web/src/app/api/admin/sales*`: resumen global, edicion admin auditada y registro de modificaciones.
- `apps/web/src/app/api/auth/register/route.ts`: registro publico de usuarios `Minorista`.
- `apps/web/src/app/api/deliveries/from-sale/route.ts`: generacion de remito operativo desde venta.
- `apps/web/src/app/api/deliveries/[id]/items/route.ts`: detalle de remito.
- `apps/web/src/app/api/fiscal/status/route.ts`: estado del proveedor fiscal configurado.
- `apps/web/src/app/api/fiscal/documents/[id]/authorize/route.ts`: punto reservado para autorizar documentos fiscales cuando ARCA se habilite.
- `apps/web/src/app/api/pdfs/*`: generacion PDF Node para presupuestos, remitos, cuenta corriente, registros de pago, ordenes de compra, devoluciones, solicitudes de pedido y listas de precios.
- `apps/web/src/app/api/auth/login/route.ts`: login compatible con `usuarios.contrasena` de PHP.
- `apps/web/src/app/api/auth/logout/route.ts`: cierre de sesion Node.
- `apps/web/src/app/api/auth/me/route.ts`: sesion actual.
- `apps/web/src/lib/db.ts`: pool PostgreSQL lazy, inicializado solo en runtime.
- `apps/web/src/lib/env.ts`: resolucion de `DATABASE_URL` o variables `SUPABASE_DB_*`.
- `apps/web/src/lib/catalog.ts`: repositorio inicial de clientes/productos.
- `apps/web/src/lib/catalog-management.ts`: mutaciones migradas desde PHP para clientes, productos y proveedores.
- `apps/web/src/lib/orders.ts`: repositorio y mutaciones migradas para pedidos, detalle, stock y cobro simple.
- `apps/web/src/lib/sales-documents.ts`: repositorio y mutacion de notas internas de venta/remito.
- `apps/web/src/lib/collections.ts`: circuito de cobros pendiente/aprobacion/rechazo.
- `apps/web/src/lib/quotes.ts`: presupuestos comerciales con calculo de totales.
- `apps/web/src/lib/deliveries.ts`: asignacion de pedidos a repartidor y link WhatsApp.
- `apps/web/src/lib/purchases.ts`: compras, paquetes, stock recibido y pagos a proveedores.
- `apps/web/src/lib/accounts.ts`: cuentas corrientes y registro manual de pagos.
- `apps/web/src/lib/admin-metrics.ts`: indicadores de ventas, cobranzas, stock, compras y caja.
- `apps/web/src/lib/employees.ts`: alta, edicion, estado, rol y permisos de empleados.
- `apps/web/src/lib/pricing.ts`: margenes, rubros, listas de precio y multiplicadores.
- `apps/web/src/lib/imports.ts`: parser CSV, importadores, alta y actualizacion masiva de productos.
- `apps/web/src/lib/messages.ts`: mensajeria interna, tareas y seguimiento de recompra.
- `apps/web/src/lib/sales-admin.ts`: reportes de ventas/remitos y edicion auditada.
- `apps/web/src/lib/fiscal.ts`: frontera de integracion fiscal; hoy devuelve `410` para ARCA y deja listo el adaptador futuro.
- `apps/web/src/lib/storage.ts`: subida server-side a Supabase Storage mediante REST, con validacion de imagen y URLs publicas.
- `apps/web/src/lib/pdf/*`: motor PDF Node y builders de documentos operativos.
- `apps/web/src/lib/auth.ts`: cookie HTTP-only firmada, verificacion bcrypt heredada y RBAC basico por rango.
- `apps/web/src/lib/route-auth.ts`: autorizacion de APIs por sesion Node, rol heredado y permisos granulares.

## Pantallas React migradas

- `/customers`: clientes con busqueda y paginacion.
- `/products`: productos con busqueda, costo, stock real, reservado y disponible.
- `/orders`: pedidos/ventas con filtros por estado operativo, estado de cobro y accion para actualizar estado.
- `/collections`: cola de cobros pendientes con acciones de aprobacion y rechazo.
- `/purchases`: compras, estado de paquete, pagos, saldos proveedor, cambio de estado y carga de recibo.
- `/quotes`: presupuestos por estado, vencimiento, totales y accion de aceptacion.
- `/employees`: empleados, rangos, permisos asignados y estado.
- `/admin`: metricas financieras base, flujo de caja y cuentas por pagar.
- `/login`: acceso Node compatible con usuarios existentes.

Estas pantallas consultan PostgreSQL desde Server Components. No exponen credenciales al navegador. Las pantallas internas requieren sesion staff.

## APIs iniciales

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/customers?q=&page=&pageSize=`
- `POST /api/customers`
- `GET /api/customers/:id`
- `PATCH /api/customers/:id`
- `GET /api/products?q=&page=&pageSize=`
- `GET /api/products/:id`
- `PATCH /api/products/:id`
- `GET /api/suppliers?q=&page=&pageSize=`
- `POST /api/suppliers`
- `GET /api/suppliers/:id`
- `PATCH /api/suppliers/:id`
- `DELETE /api/suppliers/:id`
- `GET /api/orders?q=&status=&collectionStatus=&page=&pageSize=`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/status`
- `PATCH /api/orders/:id/observation`
- `PATCH /api/orders/:id/collection`
- `GET /api/sales-documents?id_venta=`
- `GET /api/sales-documents?id_remito=`
- `POST /api/sales-documents`
- `GET /api/collections/pending`
- `POST /api/collections/:id/register`
- `POST /api/collections/:id/approve`
- `POST /api/collections/:id/reject`
- `GET /api/quotes?status=`
- `POST /api/quotes`
- `GET /api/quotes/:id`
- `DELETE /api/quotes/:id`
- `POST /api/quotes/:id/accept`
- `GET /api/deliveries/people`
- `POST /api/deliveries`
- `POST /api/deliveries/from-sale`
- `GET /api/deliveries/:id/items`
- `GET /api/purchases`
- `POST /api/purchases`
- `GET /api/purchases/:id`
- `PATCH /api/purchases/:id`
- `DELETE /api/purchases/:id`
- `POST /api/purchases/:id/package`
- `POST /api/purchases/:id/payment`
- `GET /api/accounts?type=&name=&from=&to=&page=&pageSize=`
- `POST /api/accounts`
- `DELETE /api/accounts/:id`
- `GET /api/payment-records?type=&name=&from=&to=&page=&pageSize=`
- `POST /api/payment-records`
- `DELETE /api/payment-records/:id`
- `GET /api/admin/metrics`
- `GET /api/admin/accounts-payable`
- `GET /api/admin/cashflow`
- `GET /api/employees`
- `POST /api/employees`
- `PATCH /api/employees/:id`
- `POST /api/employees/:id/toggle-status`
- `GET /api/employees/permissions`
- `GET /api/pricing/margins`
- `POST /api/pricing/margins`
- `PATCH /api/pricing/margins/:code`
- `DELETE /api/pricing/margins/:code`
- `GET /api/pricing/price-lists`
- `POST /api/pricing/price-lists`
- `PATCH /api/pricing/price-lists/:id`
- `DELETE /api/pricing/price-lists/:id`
- `POST /api/pricing/price-lists/multipliers`
- `GET /api/pricing/rubrics`
- `POST /api/pricing/rubrics`
- `POST /api/imports/products`
- `POST /api/imports/customers`
- `POST /api/imports/product-codes`
- `POST /api/stock/recount`
- `POST /api/stock/products`
- `POST /api/stock/products/upload`
- `PATCH /api/stock/bulk-products`
- `POST /api/purchases/:id/receipt-photo`
- `GET /api/vendors`
- `GET /api/messages`
- `POST /api/messages`
- `POST /api/messages/read`
- `GET /api/tasks`
- `POST /api/tasks`
- `POST /api/tasks/:id/complete`
- `GET /api/customers/follow-up`
- `GET /api/admin/sales-summary?periodo=`
- `GET /api/sales-ledger`
- `PATCH /api/sales-records/field`
- `GET /api/admin/sales/:id`
- `PATCH /api/admin/sales/:id`
- `GET /api/admin/sales/audit`
- `GET /api/fiscal/status`
- `POST /api/fiscal/documents/:id/authorize`
- `GET /api/pdfs/quotes/:id`
- `GET /api/pdfs/deliveries/:id?prices=1`
- `GET /api/pdfs/accounts/current?type=&name=&from=&to=`
- `GET /api/pdfs/payment-records/:id`
- `GET /api/pdfs/purchases/:id/order`
- `GET /api/pdfs/purchases/:id/return-request`
- `GET /api/pdfs/orders/:id/request`
- `GET /api/pdfs/pricing/price-list?list=`

Fuera de desarrollo, las APIs JSON requieren `STARLIM_API_KEY` por `X-Api-Key` o `Authorization: Bearer ...`. Las pantallas internas no usan esa clave en el navegador.
Las mutaciones (`POST`, `PATCH`, `DELETE`) requieren sesion Node de staff y permisos equivalentes al modulo migrado.

## Backend PHP migrado

- `api/php/clientes_be.php` -> `POST /api/customers` y `PATCH /api/customers/:id`.
- `api/php/proveedores_be.php` -> `POST /api/suppliers`, `PATCH /api/suppliers/:id` y `DELETE /api/suppliers/:id`.
- `api/php/actualizar_producto_ajax.php` -> `PATCH /api/products/:id`, incluyendo justificacion obligatoria y auditoria en `stock_modificaciones`.
- `api/php/get_detalle_venta.php` -> `GET /api/orders/:id`.
- `api/php/actualizar_estado_pedido.php` -> `PATCH /api/orders/:id/status` y `PATCH /api/orders/:id/observation`.
- `api/php/pedido_stock.php` -> integrado en `PATCH /api/orders/:id/status` cuando el pedido pasa a `entregado`.
- `api/php/actualizar_cobro_venta.php` -> `PATCH /api/orders/:id/collection`.
- `api/php/get_comprobantes_venta.php` -> `GET /api/sales-documents`.
- `api/php/crear_nota_venta.php` -> `POST /api/sales-documents`, solo notas internas; fiscal sigue deshabilitado.
- `api/php/cobros_aprobacion_lib.php` -> `POST /api/collections/:id/approve` y `POST /api/collections/:id/reject`.
- Registro de cobro de `api/frontend/panel_cobros_pagos.php` -> `POST /api/collections/:id/register`.
- `api/php/generar_presupuesto.php` -> `POST /api/quotes` como API JSON y `GET /api/pdfs/quotes/:id` para PDF.
- `api/php/aceptar_presupuesto.php` -> `POST /api/quotes/:id/accept`.
- `api/php/denegar_presupuesto.php` -> `DELETE /api/quotes/:id`.
- `api/php/crear_reparto.php` -> `POST /api/deliveries`.
- Registro de compras de `api/frontend/compras.php` -> `POST /api/purchases`.
- `api/php/compras_paquete_ajax.php` -> `POST /api/purchases/:id/package`.
- Pago proveedor de `api/frontend/panel_cobros_pagos.php` -> `POST /api/purchases/:id/payment`.
- Alta/baja manual de `cuentas_corrientes` desde `api/frontend/panel_cobros_pagos.php` -> `POST /api/accounts` y `DELETE /api/accounts/:id`.
- Alta/baja manual de `pagos_registro` desde `api/frontend/panel_cobros_pagos.php` -> `POST /api/payment-records` y `DELETE /api/payment-records/:id`.
- `api/frontend/planilla_admin.php`, `api/frontend/admin_balance.php`, `api/frontend/admin_cashflow.php` y `api/frontend/admin_cuentas_por_pagar.php` -> `GET /api/admin/metrics`, `GET /api/admin/cashflow` y `GET /api/admin/accounts-payable` como APIs base.
- `api/php/empleados_be.php` y `api/php/empleados_lib.php` -> `GET/POST /api/employees`, `PATCH /api/employees/:id`, `POST /api/employees/:id/toggle-status` y `GET /api/employees/permissions`.
- `api/php/crear_margen_be.php`, `api/php/actualizar_margen_be.php`, `api/php/actualizar_nombre_margen_be.php` y `api/php/eliminar_margen_be.php` -> `POST/PATCH/DELETE /api/pricing/margins`.
- `api/php/crear_lista_precio_be.php`, `api/php/eliminar_lista_precio_be.php` y `api/php/actualizar_lista_margen_be.php` -> `POST/DELETE /api/pricing/price-lists` y `POST /api/pricing/price-lists/multipliers`.
- `api/php/crear_rubro_be.php` -> `POST /api/pricing/rubrics`.
- `api/php/importar_productos_be.php`, `api/php/importar_clientes_be.php` y `api/php/actualizar_codigos_be.php` -> `POST /api/imports/products`, `POST /api/imports/customers` y `POST /api/imports/product-codes`.
- `api/php/aplicar_reconteo.php`, `api/php/actualizar_stock_be.php` y `api/php/stock_upload_be.php` -> `POST /api/stock/recount`, `PATCH /api/stock/bulk-products`, `POST /api/stock/products` y `POST /api/stock/products/upload`.
- `api/php/compras_foto_recibo.php` -> `POST /api/purchases/:id/receipt-photo`.
- `api/php/get_vendedores.php` -> `GET /api/vendors`.
- `api/php/mensajes_lib.php`, `api/php/enviar_mensaje.php`, `api/php/marcar_mensajes_leidos.php` y `api/php/nav_mensajes_data.php` -> `GET/POST /api/messages` y `POST /api/messages/read`.
- `api/frontend/recordatorios.php` y `api/php/completar_tarea_ajax.php` -> `GET/POST /api/tasks` y `POST /api/tasks/:id/complete`.
- `api/php/seguimiento_lib.php` y `api/frontend/seguimiento_clientes.php` -> `GET /api/customers/follow-up`.
- `api/php/get_resumen_global.php` -> `GET /api/admin/sales-summary`.
- `api/php/get_facturas_cliente.php` -> `GET /api/sales-ledger`.
- `api/php/actualizar_campo_venta.php` -> `PATCH /api/sales-records/field`.
- `api/php/modo_admin_ventas_be.php` -> `GET/PATCH /api/admin/sales/:id` y `GET /api/admin/sales/audit`.
- `api/php/registro_usuario_be.php` -> `POST /api/auth/register`.
- `api/php/generar_remito_venta.php` y `api/php/get_detalle_remito.php` -> `POST /api/deliveries/from-sale` y `GET /api/deliveries/:id/items`.
- `api/php/ver_presupuesto_pdf.php` y `api/php/presupuesto_pdf_lib.php` -> `GET /api/pdfs/quotes/:id`.
- `api/php/generar_pdf_remito.php` -> `GET /api/pdfs/deliveries/:id`.
- `api/php/generar_pdf_cuenta_corriente.php` -> `GET /api/pdfs/accounts/current`.
- `api/php/generar_pdf_registro_pago.php` -> `GET /api/pdfs/payment-records/:id`.
- `api/php/generar_pdf_orden_compra.php` -> `GET /api/pdfs/purchases/:id/order`.
- `api/php/generar_pdf_solicitud_devolucion.php` -> `GET /api/pdfs/purchases/:id/return-request`.
- `api/php/generar_pdf_solicitud_pedido.php` -> `GET /api/pdfs/orders/:id/request`.
- `api/php/generar_pdf_precios.php` -> `GET /api/pdfs/pricing/price-list`.

La capa Node mantiene el contexto multiempresa con `set_config('app.current_empresa_id', ...)` antes de consultar o escribir.

## Alcance pendiente

- Formularios React de escritura restantes para altas/ediciones finas de clientes, proveedores, productos y stock.
- Paridad visual fina de PDFs contra los FPDF legacy antes de apagar los enlaces PHP definitivos.
- Facturacion fiscal ARCA online y archivos fiscales asociados. Queda para la etapa final; Node ya tiene una frontera fiscal aislada en `apps/web/src/lib/fiscal.ts` y endpoints reservados que hoy devuelven `410` al intentar autorizar.
- Cambio de password de carga masiva y reemplazo destructivo completo de productos (`cambiar_pass_masiva_be.php`, `carga_masiva_be.php`) requieren una confirmacion funcional especifica antes de exponerlos en Node.
- Revision fina de reportes historicos para igualar cada total del PHP antes de retirar esas pantallas.
- ARCA/facturacion fiscal queda como etapa final.

## Reorganizacion operativa Node

La app Node ya reemplaza la navegacion plana por grupos y submenus:

- `Metricas`: metricas operativas sin balance financiero.
- `Balance`: resumen, estado de resultados, sueldos y dividendos.
- `Tesoreria`: saldos actuales, Cash Flow, cuentas por pagar y registro de movimientos.
- `Pedidos`: dashboard, recibidos, en proceso y pendiente entrega.
- `Ventas`: ventas registradas, cargar pedido y presupuestos.
- `Base de datos`: empleados, precios, clientes y proveedores.
- `Stock`: cambiar stock, nuevo stock y carga masiva. Se retiro el endpoint Node de recontar stock.
- `Compras`: nueva compra, urgentes, anticipadas y solicitudes.
- `Cobros y pagos`: cobros, cuentas corrientes y pagos proveedores.
- `Usuarios y permisos`: empleados, gestion de vendedores y registro de movimientos.
- `Administrador`: solicitudes y aprobaciones.
- `Calendario`: recordatorios/tareas con configuracion recurrente.
- `Mensajes`: recibidos, enviados y borradores entre usuarios registrados.

La migracion `migrations/014_node_navigation_and_workflows.sql` agrega presencia online, solicitudes internas, estados/importancia de mensajes, recurrencia de tareas y metas de vendedores. Fue aplicada en el entorno local usado para esta implementacion.

La sesion Node vence a los 20 minutos de inactividad y se renueva por actividad mediante `src/proxy.ts`.

## Ejecucion local

```bash
cd apps/web
npm run dev
```

La nueva app queda disponible en `http://localhost:3000`.

Para probar la API:

```bash
curl http://localhost:3000/api/health
```

## Variables

Crear `apps/web/.env.local` tomando como base `apps/web/.env.example`.

`DATABASE_URL` tiene prioridad si esta definido. Si no, la app usa:

- `SUPABASE_DB_HOST`
- `SUPABASE_DB_PORT`
- `SUPABASE_DB_NAME`
- `SUPABASE_DB_USER`
- `SUPABASE_DB_PASS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STARLIM_STORAGE_BUCKET`
- `STARLIM_SESSION_SECRET`
- `STARLIM_PEPPER`

ARCA queda deshabilitado por defecto. Para la etapa final, el adaptador fiscal puede colgarse de:

- `STARLIM_FISCAL_PROVIDER=arca`
- `STARLIM_FISCAL_MODE=testing|production`
- `STARLIM_ARCA_CUIT`
- `STARLIM_ARCA_CERT_PATH`
- `STARLIM_ARCA_KEY_PATH`
- `STARLIM_ARCA_POINT_OF_SALE`

No commitear `.env.local`, `.env` ni secretos reales.

## Dependencias Node agregadas

- `csv-parse`: parseo robusto de CSV.
- `iconv-lite`: conversion de archivos CSV exportados en UTF-8, UTF-16 o Windows-1252.
- `pdfkit`: generacion PDF server-side para documentos operativos migrados.

## Orden recomendado

1. Formularios React restantes para alta/edicion avanzada de catalogo, stock y datos maestros.
2. Comparar reportes/admin avanzados contra los totales del PHP en datos reales antes de retirar esas pantallas.
3. Ajustar paridad visual fina de PDFs contra FPDF legacy en datos reales antes de retirar enlaces PHP.
4. Facturacion fiscal ARCA cuando pedidos/ventas ya esten estables en Node.
5. Chatbots/IA como servicio separado que consuma APIs internas, no consultas directas desde el cliente.

## Decisiones iniciales

- No se reemplaza PHP de golpe.
- La app React/Node convive con el ERP actual.
- La conexion a PostgreSQL queda solo del lado servidor.
- Las variables publicas `NEXT_PUBLIC_*` no deben contener claves privadas ni service role.
- Las mutaciones migradas no aceptan escritura anonima, incluso en desarrollo.
- La sesion Node no reemplaza aun la sesion PHP; conviven durante la migracion.
