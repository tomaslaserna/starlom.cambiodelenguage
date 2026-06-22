RESULTADO GLOBAL: BLOCKED

- Fecha y hora: 2026-06-19T13:45:15.703791
- Rama: security/hardening-2026-06-19
- Commit: 1e5d62aeadbaab4b9104c08f1faeb2746cc06664
- Entorno probado: repo local + Supabase configurado + produccion solo lectura
- URL probada: https://star-lim-phi.vercel.app
- Base/proyecto: Supabase configurado por variables locales (valores redactados)
- PASS: 199
- FAIL: 0
- BLOCKED: 7
- WARNING: 1
- Rutas cubiertas: 10.42%
- Endpoints cubiertos: 0.0%
- Funciones de negocio cubiertas: 0% directo; cobertura indirecta documentada en matriz
- Datos de prueba creados: ninguno
- Produccion modificada: NO

## Tabla de resultados

| ID | Capa | Modulo | Ruta/endpoint/tabla | Prueba | Estado | Esperado | Obtenido | Duracion | Evidencia |
|---|---|---|---|---|---|---|---|---:|---|
| STATIC-0001 | static | php | `all php files` | php -l syntax | BLOCKED | PHP CLI available | php executable not found in PATH | 0ms | tooling |
| STATIC-0002 | static | vercel | `vercel.json` | JSON parse | PASS | Valid JSON | Parsed successfully | 0ms | vercel.json |
| STATIC-0003 | static | includes | `api/facturacion/src/afip.php-master/examples/CreateVoucher.php` | include ../src/Afip.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/facturacion/src/afip.php-master/examples/CreateVoucher.php |
| STATIC-0004 | static | includes | `api/frontend/actualizar_codigos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/actualizar_codigos.php |
| STATIC-0005 | static | includes | `api/frontend/admin_balance.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_balance.php |
| STATIC-0006 | static | includes | `api/frontend/admin_calendario.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_calendario.php |
| STATIC-0007 | static | includes | `api/frontend/admin_cashflow.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_cashflow.php |
| STATIC-0008 | static | includes | `api/frontend/admin_conciliacion_bancaria.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_conciliacion_bancaria.php |
| STATIC-0009 | static | includes | `api/frontend/admin_cuentas_por_pagar.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_cuentas_por_pagar.php |
| STATIC-0010 | static | includes | `api/frontend/admin_dividendos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_dividendos.php |
| STATIC-0011 | static | includes | `api/frontend/admin_movimientos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_movimientos.php |
| STATIC-0012 | static | includes | `api/frontend/admin_obligaciones_fiscales.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_obligaciones_fiscales.php |
| STATIC-0013 | static | includes | `api/frontend/admin_resultados.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_resultados.php |
| STATIC-0014 | static | includes | `api/frontend/admin_sueldos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_sueldos.php |
| STATIC-0015 | static | includes | `api/frontend/admin_tesoreria.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/admin_tesoreria.php |
| STATIC-0016 | static | includes | `api/frontend/carga_masiva.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/carga_masiva.php |
| STATIC-0017 | static | includes | `api/frontend/clientes.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/clientes.php |
| STATIC-0018 | static | includes | `api/frontend/compras.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/compras.php |
| STATIC-0019 | static | includes | `api/frontend/edit_stock.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/edit_stock.php |
| STATIC-0020 | static | includes | `api/frontend/factura_manual.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/factura_manual.php |
| STATIC-0021 | static | includes | `api/frontend/facturacion.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/facturacion.php |
| STATIC-0022 | static | includes | `api/frontend/gestion_empleados.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/gestion_empleados.php |
| STATIC-0023 | static | includes | `api/frontend/gestion_margenes.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/gestion_margenes.php |
| STATIC-0024 | static | includes | `api/frontend/importar_clientes.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/importar_clientes.php |
| STATIC-0025 | static | includes | `api/frontend/importar_precios.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/importar_precios.php |
| STATIC-0026 | static | includes | `api/frontend/importar_productos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/importar_productos.php |
| STATIC-0027 | static | includes | `api/frontend/index.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/index.php |
| STATIC-0028 | static | includes | `api/frontend/index.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/index.php |
| STATIC-0029 | static | includes | `api/frontend/margenes.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/margenes.php |
| STATIC-0030 | static | includes | `api/frontend/new_stock.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/new_stock.php |
| STATIC-0031 | static | includes | `api/frontend/panel_base_datos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/panel_base_datos.php |
| STATIC-0032 | static | includes | `api/frontend/panel_cobros_pagos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/panel_cobros_pagos.php |
| STATIC-0033 | static | includes | `api/frontend/panel_empleados.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/panel_empleados.php |
| STATIC-0034 | static | includes | `api/frontend/pedidos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/pedidos.php |
| STATIC-0035 | static | includes | `api/frontend/planilla_admin.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/planilla_admin.php |
| STATIC-0036 | static | includes | `api/frontend/presupuestar.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/presupuestar.php |
| STATIC-0037 | static | includes | `api/frontend/presupuestos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/presupuestos.php |
| STATIC-0038 | static | includes | `api/frontend/proceso_ventas.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/proceso_ventas.php |
| STATIC-0039 | static | includes | `api/frontend/proceso_ventas.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/proceso_ventas.php |
| STATIC-0040 | static | includes | `api/frontend/productos.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/productos.php |
| STATIC-0041 | static | includes | `api/frontend/proveedores.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/proveedores.php |
| STATIC-0042 | static | includes | `api/frontend/recontar_stock.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/recontar_stock.php |
| STATIC-0043 | static | includes | `api/frontend/recordatorios.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/recordatorios.php |
| STATIC-0044 | static | includes | `api/frontend/registro_stock.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/registro_stock.php |
| STATIC-0045 | static | includes | `api/frontend/seguimiento_clientes.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/seguimiento_clientes.php |
| STATIC-0046 | static | includes | `api/frontend/seguimiento_clientes.php` | include ../php/seguimiento_lib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/seguimiento_clientes.php |
| STATIC-0047 | static | includes | `api/frontend/stock.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/stock.php |
| STATIC-0048 | static | includes | `api/frontend/ventas.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/ventas.php |
| STATIC-0049 | static | includes | `api/frontend/ventas_registradas.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/ventas_registradas.php |
| STATIC-0050 | static | includes | `api/frontend/ver_precios.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/ver_precios.php |
| STATIC-0051 | static | includes | `api/frontend/view_producto.php` | include ../php/conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/frontend/view_producto.php |
| STATIC-0052 | static | includes | `api/php/aceptar_presupuesto.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/aceptar_presupuesto.php |
| STATIC-0053 | static | includes | `api/php/actualizar_campo_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_campo_venta.php |
| STATIC-0054 | static | includes | `api/php/actualizar_campo_venta.php` | include pedido_stock.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_campo_venta.php |
| STATIC-0055 | static | includes | `api/php/actualizar_cobro_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_cobro_venta.php |
| STATIC-0056 | static | includes | `api/php/actualizar_codigos_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_codigos_be.php |
| STATIC-0057 | static | includes | `api/php/actualizar_estado_pedido.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_estado_pedido.php |
| STATIC-0058 | static | includes | `api/php/actualizar_estado_pedido.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_estado_pedido.php |
| STATIC-0059 | static | includes | `api/php/actualizar_estado_pedido.php` | include pedido_stock.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_estado_pedido.php |
| STATIC-0060 | static | includes | `api/php/actualizar_lista_margen_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_lista_margen_be.php |
| STATIC-0061 | static | includes | `api/php/actualizar_margen_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_margen_be.php |
| STATIC-0062 | static | includes | `api/php/actualizar_nombre_margen_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_nombre_margen_be.php |
| STATIC-0063 | static | includes | `api/php/actualizar_producto_ajax.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_producto_ajax.php |
| STATIC-0064 | static | includes | `api/php/actualizar_rango_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_rango_be.php |
| STATIC-0065 | static | includes | `api/php/actualizar_stock_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_stock_be.php |
| STATIC-0066 | static | includes | `api/php/actualizar_telefono_empleado.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_telefono_empleado.php |
| STATIC-0067 | static | includes | `api/php/actualizar_telefono_empleado.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/actualizar_telefono_empleado.php |
| STATIC-0068 | static | includes | `api/php/aplicar_reconteo.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/aplicar_reconteo.php |
| STATIC-0069 | static | includes | `api/php/cambiar_pass_masiva_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/cambiar_pass_masiva_be.php |
| STATIC-0070 | static | includes | `api/php/carga_masiva_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/carga_masiva_be.php |
| STATIC-0071 | static | includes | `api/php/clientes_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/clientes_be.php |
| STATIC-0072 | static | includes | `api/php/clientes_be.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/clientes_be.php |
| STATIC-0073 | static | includes | `api/php/completar_tarea_ajax.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/completar_tarea_ajax.php |
| STATIC-0074 | static | includes | `api/php/compras_foto_recibo.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/compras_foto_recibo.php |
| STATIC-0075 | static | includes | `api/php/compras_paquete_ajax.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/compras_paquete_ajax.php |
| STATIC-0076 | static | includes | `api/php/crear_empleado_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/crear_empleado_be.php |
| STATIC-0077 | static | includes | `api/php/crear_lista_precio_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/crear_lista_precio_be.php |
| STATIC-0078 | static | includes | `api/php/crear_margen_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/crear_margen_be.php |
| STATIC-0079 | static | includes | `api/php/crear_nota_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/crear_nota_venta.php |
| STATIC-0080 | static | includes | `api/php/crear_nota_venta.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/crear_nota_venta.php |
| STATIC-0081 | static | includes | `api/php/crear_reparto.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/crear_reparto.php |
| STATIC-0082 | static | includes | `api/php/crear_reparto.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/crear_reparto.php |
| STATIC-0083 | static | includes | `api/php/crear_rubro_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/crear_rubro_be.php |
| STATIC-0084 | static | includes | `api/php/denegar_presupuesto.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/denegar_presupuesto.php |
| STATIC-0085 | static | includes | `api/php/eliminar_lista_precio_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/eliminar_lista_precio_be.php |
| STATIC-0086 | static | includes | `api/php/eliminar_margen_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/eliminar_margen_be.php |
| STATIC-0087 | static | includes | `api/php/emitir_factura_manual.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/emitir_factura_manual.php |
| STATIC-0088 | static | includes | `api/php/empleados_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/empleados_be.php |
| STATIC-0089 | static | includes | `api/php/enviar_mensaje.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/enviar_mensaje.php |
| STATIC-0090 | static | includes | `api/php/generar_pdf_comprobante.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_comprobante.php |
| STATIC-0091 | static | includes | `api/php/generar_pdf_comprobante.php` | include ../fpdf186/fpdf.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_comprobante.php |
| STATIC-0092 | static | includes | `api/php/generar_pdf_factura.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_factura.php |
| STATIC-0093 | static | includes | `api/php/generar_pdf_factura.php` | include ../fpdf186/fpdf.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_factura.php |
| STATIC-0094 | static | includes | `api/php/generar_pdf_precios.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_precios.php |
| STATIC-0095 | static | includes | `api/php/generar_pdf_precios.php` | include ../fpdf186/fpdf.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_precios.php |
| STATIC-0096 | static | includes | `api/php/generar_pdf_remito.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_remito.php |
| STATIC-0097 | static | includes | `api/php/generar_pdf_remito.php` | include ../fpdf186/fpdf.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_remito.php |
| STATIC-0098 | static | includes | `api/php/generar_pdf_solicitud_devolucion.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_solicitud_devolucion.php |
| STATIC-0099 | static | includes | `api/php/generar_pdf_solicitud_devolucion.php` | include comprobante_pdf_lib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_solicitud_devolucion.php |
| STATIC-0100 | static | includes | `api/php/generar_pdf_solicitud_pedido.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_solicitud_pedido.php |
| STATIC-0101 | static | includes | `api/php/generar_pdf_solicitud_pedido.php` | include comprobante_pdf_lib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_solicitud_pedido.php |
| STATIC-0102 | static | includes | `api/php/generar_presupuesto.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_presupuesto.php |
| STATIC-0103 | static | includes | `api/php/generar_presupuesto.php` | include presupuesto_pdf_lib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_presupuesto.php |
| STATIC-0104 | static | includes | `api/php/generar_remito_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_remito_venta.php |
| STATIC-0105 | static | includes | `api/php/get_cliente.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_cliente.php |
| STATIC-0106 | static | includes | `api/php/get_clientes.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_clientes.php |
| STATIC-0107 | static | includes | `api/php/get_comprobantes_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_comprobantes_venta.php |
| STATIC-0108 | static | includes | `api/php/get_comprobantes_venta.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_comprobantes_venta.php |
| STATIC-0109 | static | includes | `api/php/get_detalle_remito.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_detalle_remito.php |
| STATIC-0110 | static | includes | `api/php/get_detalle_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_detalle_venta.php |
| STATIC-0111 | static | includes | `api/php/get_facturas_cliente.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_facturas_cliente.php |
| STATIC-0112 | static | includes | `api/php/get_resumen_global.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_resumen_global.php |
| STATIC-0113 | static | includes | `api/php/get_vendedores.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_vendedores.php |
| STATIC-0114 | static | includes | `api/php/importar_clientes_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/importar_clientes_be.php |
| STATIC-0115 | static | includes | `api/php/importar_precios_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/importar_precios_be.php |
| STATIC-0116 | static | includes | `api/php/importar_productos_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/importar_productos_be.php |
| STATIC-0117 | static | includes | `api/php/login_usuario_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/login_usuario_be.php |
| STATIC-0118 | static | includes | `api/php/marcar_mensajes_leidos.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/marcar_mensajes_leidos.php |
| STATIC-0119 | static | includes | `api/php/modo_admin_ventas_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/modo_admin_ventas_be.php |
| STATIC-0120 | static | includes | `api/php/modo_admin_ventas_be.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/modo_admin_ventas_be.php |
| STATIC-0121 | static | includes | `api/php/nav_mensajes_data.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/nav_mensajes_data.php |
| STATIC-0122 | static | includes | `api/php/proveedores_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/proveedores_be.php |
| STATIC-0123 | static | includes | `api/php/proveedores_be.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/proveedores_be.php |
| STATIC-0124 | static | includes | `api/php/registro_usuario_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/registro_usuario_be.php |
| STATIC-0125 | static | includes | `api/php/stock_upload_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/stock_upload_be.php |
| STATIC-0126 | static | includes | `api/php/ver_presupuesto_pdf.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/ver_presupuesto_pdf.php |
| STATIC-0127 | static | includes | `api/php/ver_presupuesto_pdf.php` | include presupuesto_pdf_lib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/ver_presupuesto_pdf.php |
| STATIC-0128 | static | includes | `api/phpqrcode/index.php` | include qrlib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/phpqrcode/index.php |
| SEC-0129 | static | secrets | `repository` | secret pattern scan | WARNING | No obvious secrets committed | 5 files flagged: ['.env.example', '.env.smoke.example', 'api/facturacion/src/afip.php-master/src/Afip.php', 'api/php/storage_supabase.php', 'reports/starlim-inventory.json'] | 0ms | rg-like scan |
| DB-0130 | database | connectivity | `Supabase` | SELECT 1 | PASS | 1 | 1 | 198ms | select 1 |
| DB-0131 | database | schema | `usuarios` | expected table exists | PASS | table exists | 1 | 590ms | information_schema.tables |
| DB-0132 | database | schema | `empresas` | expected table exists | PASS | table exists | 1 | 577ms | information_schema.tables |
| DB-0133 | database | schema | `usuario_empresa` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0134 | database | schema | `app_roles` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0135 | database | schema | `app_permisos` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0136 | database | schema | `app_usuario_roles` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0137 | database | schema | `app_usuario_permisos` | expected table exists | PASS | table exists | 1 | 579ms | information_schema.tables |
| DB-0138 | database | schema | `secuencias_empresa` | expected table exists | PASS | table exists | 1 | 576ms | information_schema.tables |
| DB-0139 | database | schema | `ventas` | expected table exists | PASS | table exists | 1 | 587ms | information_schema.tables |
| DB-0140 | database | schema | `detalle_ventas` | expected table exists | PASS | table exists | 1 | 587ms | information_schema.tables |
| DB-0141 | database | schema | `presupuestos` | expected table exists | PASS | table exists | 1 | 568ms | information_schema.tables |
| DB-0142 | database | schema | `remitos` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0143 | database | schema | `detalle_remitos` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0144 | database | schema | `repartos` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0145 | database | schema | `reparto_pedidos` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0146 | database | schema | `clientes` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0147 | database | schema | `proveedores` | expected table exists | PASS | table exists | 1 | 572ms | information_schema.tables |
| DB-0148 | database | schema | `customer_fiscal_profile` | expected table exists | PASS | table exists | 1 | 577ms | information_schema.tables |
| DB-0149 | database | schema | `productos` | expected table exists | PASS | table exists | 1 | 579ms | information_schema.tables |
| DB-0150 | database | schema | `rubros` | expected table exists | PASS | table exists | 1 | 572ms | information_schema.tables |
| DB-0151 | database | schema | `margenes` | expected table exists | PASS | table exists | 1 | 577ms | information_schema.tables |
| DB-0152 | database | schema | `listas_precio` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0153 | database | schema | `margenes_listas` | expected table exists | PASS | table exists | 1 | 580ms | information_schema.tables |
| DB-0154 | database | schema | `compras_registro` | expected table exists | PASS | table exists | 1 | 580ms | information_schema.tables |
| DB-0155 | database | schema | `detalle_compras_registro` | expected table exists | PASS | table exists | 1 | 588ms | information_schema.tables |
| DB-0156 | database | schema | `stock_modificaciones` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0157 | database | schema | `pagos_registro` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0158 | database | schema | `cuentas_corrientes` | expected table exists | PASS | table exists | 1 | 579ms | information_schema.tables |
| DB-0159 | database | schema | `billing_document` | expected table exists | PASS | table exists | 1 | 580ms | information_schema.tables |
| DB-0160 | database | schema | `billing_document_line` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0161 | database | schema | `billing_tax_line` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0162 | database | schema | `fiscal_authorization` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0163 | database | schema | `billing_payment_allocation` | expected table exists | PASS | table exists | 1 | 579ms | information_schema.tables |
| DB-0164 | database | schema | `billing_event` | expected table exists | PASS | table exists | 1 | 579ms | information_schema.tables |
| DB-0165 | database | schema | `billing_audit_log` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0166 | database | schema | `fiscal_sync_job` | expected table exists | PASS | table exists | 1 | 578ms | information_schema.tables |
| DB-0167 | database | schema | `admin_resources` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0168 | database | schema | `admin_audit_log` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0169 | database | schema | `admin_socios` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0170 | database | schema | `admin_dividendos` | expected table exists | PASS | table exists | 1 | 575ms | information_schema.tables |
| DB-0171 | database | schema | `admin_sueldos_config` | expected table exists | PASS | table exists | 1 | 573ms | information_schema.tables |
| DB-0172 | database | schema | `admin_sueldo_movimientos` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0173 | database | schema | `admin_obligaciones_fiscales` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0174 | database | schema | `admin_bank_accounts` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0175 | database | schema | `admin_bank_statement_lines` | expected table exists | PASS | table exists | 1 | 570ms | information_schema.tables |
| DB-0176 | database | schema | `admin_bank_reconciliation_matches` | expected table exists | PASS | table exists | 1 | 569ms | information_schema.tables |
| DB-0177 | database | schema | `eventos_integracion` | expected table exists | PASS | table exists | 1 | 574ms | information_schema.tables |
| DB-0178 | database | schema | `ventas_modificaciones` | expected table exists | PASS | table exists | 1 | 575ms | information_schema.tables |
| PERM-0179 | database | permissions | `admin.panel` | admin resource exists | PASS | 1 active resource | 1 | 581ms | admin_resources |
| PERM-0180 | database | permissions | `admin.tesoreria` | admin resource exists | PASS | 1 active resource | 1 | 577ms | admin_resources |
| PERM-0181 | database | permissions | `admin.conciliacion_bancaria` | admin resource exists | PASS | 1 active resource | 1 | 569ms | admin_resources |
| PERM-0182 | database | permissions | `admin.metricas` | admin resource exists | PASS | 1 active resource | 1 | 580ms | admin_resources |
| PERM-0183 | database | permissions | `admin.movimientos` | admin resource exists | PASS | 1 active resource | 1 | 570ms | admin_resources |
| PERM-0184 | database | permissions | `admin.cashflow` | admin resource exists | PASS | 1 active resource | 1 | 579ms | admin_resources |
| PERM-0185 | database | permissions | `admin.balance` | admin resource exists | PASS | 1 active resource | 1 | 570ms | admin_resources |
| PERM-0186 | database | permissions | `admin.dividendos` | admin resource exists | PASS | 1 active resource | 1 | 581ms | admin_resources |
| PERM-0187 | database | permissions | `admin.sueldos` | admin resource exists | PASS | 1 active resource | 1 | 578ms | admin_resources |
| PERM-0188 | database | permissions | `admin.calendario` | admin resource exists | PASS | 1 active resource | 1 | 569ms | admin_resources |
| PERM-0189 | database | permissions | `admin.usuarios` | admin resource exists | PASS | 1 active resource | 1 | 580ms | admin_resources |
| PERM-0190 | database | permissions | `admin.obligaciones_fiscales` | admin resource exists | PASS | 1 active resource | 1 | 570ms | admin_resources |
| PERM-0191 | database | permissions | `admin.resultados` | admin resource exists | PASS | 1 active resource | 1 | 570ms | admin_resources |
| PERM-0192 | database | permissions | `admin.cuentas_por_pagar` | admin resource exists | PASS | 1 active resource | 1 | 570ms | admin_resources |
| PERM-0193 | database | permissions | `Admin` | Admin inherits all admin permissions | PASS | 36 | 36 | 0ms | app_rol_permisos |
| PERM-0194 | database | permissions | `non-Admin roles` | Non-admin roles do not inherit admin by default | PASS | 0 | 0 | 0ms | app_rol_permisos |
| TENANT-0195 | database | multiempresa | `business tables` | empresa_id coverage | PASS | all key tables have empresa_id | all present | 0ms | information_schema.columns |
| PROD-0196 | production-readonly | http | `/` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=308; location=/frontend/index.php; php_error=False | 210ms | https://star-lim-phi.vercel.app/ |
| PROD-0197 | production-readonly | http | `/frontend/index.php` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=200; location=; php_error=False | 532ms | https://star-lim-phi.vercel.app/frontend/index.php |
| PROD-0198 | production-readonly | http | `/frontend/sign.php` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=200; location=; php_error=False | 562ms | https://star-lim-phi.vercel.app/frontend/sign.php |
| PROD-0199 | production-readonly | http | `/frontend/panel_empleados.php` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=302; location=sign.php?expired=1; php_error=False | 326ms | https://star-lim-phi.vercel.app/frontend/panel_empleados.php |
| PROD-0200 | production-readonly | http | `/frontend/admin_conciliacion_bancaria.php` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=302; location=sign.php?expired=1; php_error=False | 338ms | https://star-lim-phi.vercel.app/frontend/admin_conciliacion_bancaria.php |
| PROD-0201 | production-readonly | tls | `star-lim-phi.vercel.app` | TLS certificate | PASS | valid certificate returned | Jul 27 02:04:42 2026 GMT | 0ms | ssl |
| E2E-0202 | e2e/business | safe-write-flows | `Admin login E2E` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0203 | e2e/business | safe-write-flows | `Limited user E2E` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0204 | e2e/business | safe-write-flows | `Cliente-presupuesto-venta-entrega-cobro` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0205 | e2e/business | safe-write-flows | `Compra-stock-pago` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0206 | e2e/business | safe-write-flows | `Conciliacion bancaria write flow` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0207 | e2e/business | safe-write-flows | `Facturacion fiscal authorization` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |

## Build y analisis estatico
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Base de datos
- PASS: STATIC-0031 - include ../php/conexion_starlim_be.php - api/frontend/panel_base_datos.php
- PASS: DB-0130 - SELECT 1 - Supabase
- PASS: DB-0131 - expected table exists - usuarios
- PASS: DB-0132 - expected table exists - empresas
- PASS: DB-0133 - expected table exists - usuario_empresa
- PASS: DB-0134 - expected table exists - app_roles
- PASS: DB-0135 - expected table exists - app_permisos
- PASS: DB-0136 - expected table exists - app_usuario_roles
- PASS: DB-0137 - expected table exists - app_usuario_permisos
- PASS: DB-0138 - expected table exists - secuencias_empresa
- PASS: DB-0139 - expected table exists - ventas
- PASS: DB-0140 - expected table exists - detalle_ventas
- PASS: DB-0141 - expected table exists - presupuestos
- PASS: DB-0142 - expected table exists - remitos
- PASS: DB-0143 - expected table exists - detalle_remitos
- PASS: DB-0144 - expected table exists - repartos
- PASS: DB-0145 - expected table exists - reparto_pedidos
- PASS: DB-0146 - expected table exists - clientes
- PASS: DB-0147 - expected table exists - proveedores
- PASS: DB-0148 - expected table exists - customer_fiscal_profile
- PASS: DB-0149 - expected table exists - productos
- PASS: DB-0150 - expected table exists - rubros
- PASS: DB-0151 - expected table exists - margenes
- PASS: DB-0152 - expected table exists - listas_precio
- PASS: DB-0153 - expected table exists - margenes_listas

## Backend
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Autenticacion y sesiones
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Permisos
- PASS: DB-0135 - expected table exists - app_permisos
- PASS: DB-0137 - expected table exists - app_usuario_permisos

## Multiempresa
- PASS: TENANT-0195 - empresa_id coverage - business tables

## Frontend
- PASS: STATIC-0004 - include ../php/conexion_starlim_be.php - api/frontend/actualizar_codigos.php
- PASS: STATIC-0005 - include ../php/conexion_starlim_be.php - api/frontend/admin_balance.php
- PASS: STATIC-0006 - include ../php/conexion_starlim_be.php - api/frontend/admin_calendario.php
- PASS: STATIC-0007 - include ../php/conexion_starlim_be.php - api/frontend/admin_cashflow.php
- PASS: STATIC-0008 - include ../php/conexion_starlim_be.php - api/frontend/admin_conciliacion_bancaria.php
- PASS: STATIC-0009 - include ../php/conexion_starlim_be.php - api/frontend/admin_cuentas_por_pagar.php
- PASS: STATIC-0010 - include ../php/conexion_starlim_be.php - api/frontend/admin_dividendos.php
- PASS: STATIC-0011 - include ../php/conexion_starlim_be.php - api/frontend/admin_movimientos.php
- PASS: STATIC-0012 - include ../php/conexion_starlim_be.php - api/frontend/admin_obligaciones_fiscales.php
- PASS: STATIC-0013 - include ../php/conexion_starlim_be.php - api/frontend/admin_resultados.php
- PASS: STATIC-0014 - include ../php/conexion_starlim_be.php - api/frontend/admin_sueldos.php
- PASS: STATIC-0015 - include ../php/conexion_starlim_be.php - api/frontend/admin_tesoreria.php
- PASS: STATIC-0016 - include ../php/conexion_starlim_be.php - api/frontend/carga_masiva.php
- PASS: STATIC-0017 - include ../php/conexion_starlim_be.php - api/frontend/clientes.php
- PASS: STATIC-0018 - include ../php/conexion_starlim_be.php - api/frontend/compras.php
- PASS: STATIC-0019 - include ../php/conexion_starlim_be.php - api/frontend/edit_stock.php
- PASS: STATIC-0020 - include ../php/conexion_starlim_be.php - api/frontend/factura_manual.php
- PASS: STATIC-0021 - include ../php/conexion_starlim_be.php - api/frontend/facturacion.php
- PASS: STATIC-0022 - include ../php/conexion_starlim_be.php - api/frontend/gestion_empleados.php
- PASS: STATIC-0023 - include ../php/conexion_starlim_be.php - api/frontend/gestion_margenes.php
- PASS: STATIC-0024 - include ../php/conexion_starlim_be.php - api/frontend/importar_clientes.php
- PASS: STATIC-0025 - include ../php/conexion_starlim_be.php - api/frontend/importar_precios.php
- PASS: STATIC-0026 - include ../php/conexion_starlim_be.php - api/frontend/importar_productos.php
- PASS: STATIC-0027 - include ../php/conexion_starlim_be.php - api/frontend/index.php
- PASS: STATIC-0028 - include ../php/conexion_starlim_be.php - api/frontend/index.php

## Ventas y pedidos
- PASS: STATIC-0038 - include ../php/conexion_starlim_be.php - api/frontend/proceso_ventas.php
- PASS: STATIC-0039 - include ../php/conexion_starlim_be.php - api/frontend/proceso_ventas.php
- PASS: STATIC-0048 - include ../php/conexion_starlim_be.php - api/frontend/ventas.php
- PASS: STATIC-0049 - include ../php/conexion_starlim_be.php - api/frontend/ventas_registradas.php
- PASS: STATIC-0119 - include conexion_starlim_be.php - api/php/modo_admin_ventas_be.php
- PASS: STATIC-0120 - include auth.php - api/php/modo_admin_ventas_be.php
- PASS: DB-0139 - expected table exists - ventas
- PASS: DB-0140 - expected table exists - detalle_ventas
- PASS: DB-0178 - expected table exists - ventas_modificaciones

## Stock
- PASS: STATIC-0019 - include ../php/conexion_starlim_be.php - api/frontend/edit_stock.php
- PASS: STATIC-0030 - include ../php/conexion_starlim_be.php - api/frontend/new_stock.php
- PASS: STATIC-0042 - include ../php/conexion_starlim_be.php - api/frontend/recontar_stock.php
- PASS: STATIC-0044 - include ../php/conexion_starlim_be.php - api/frontend/registro_stock.php
- PASS: STATIC-0047 - include ../php/conexion_starlim_be.php - api/frontend/stock.php
- PASS: STATIC-0054 - include pedido_stock.php - api/php/actualizar_campo_venta.php
- PASS: STATIC-0059 - include pedido_stock.php - api/php/actualizar_estado_pedido.php
- PASS: STATIC-0065 - include conexion_starlim_be.php - api/php/actualizar_stock_be.php
- PASS: STATIC-0125 - include conexion_starlim_be.php - api/php/stock_upload_be.php
- PASS: DB-0156 - expected table exists - stock_modificaciones
- BLOCKED: E2E-0205 - safe write flow gate - Compra-stock-pago

## Compras
- PASS: STATIC-0018 - include ../php/conexion_starlim_be.php - api/frontend/compras.php
- PASS: STATIC-0074 - include conexion_starlim_be.php - api/php/compras_foto_recibo.php
- PASS: STATIC-0075 - include conexion_starlim_be.php - api/php/compras_paquete_ajax.php
- PASS: DB-0154 - expected table exists - compras_registro
- PASS: DB-0155 - expected table exists - detalle_compras_registro

## Cobros y cuentas corrientes
- PASS: STATIC-0032 - include ../php/conexion_starlim_be.php - api/frontend/panel_cobros_pagos.php

## Tesoreria y cash flow
- PASS: STATIC-0015 - include ../php/conexion_starlim_be.php - api/frontend/admin_tesoreria.php
- PASS: PERM-0180 - admin resource exists - admin.tesoreria

## Conciliacion bancaria
- PASS: STATIC-0008 - include ../php/conexion_starlim_be.php - api/frontend/admin_conciliacion_bancaria.php
- PASS: PERM-0181 - admin resource exists - admin.conciliacion_bancaria
- PASS: PROD-0200 - GET route smoke - /frontend/admin_conciliacion_bancaria.php
- BLOCKED: E2E-0206 - safe write flow gate - Conciliacion bancaria write flow

## Facturacion
- PASS: STATIC-0003 - include ../src/Afip.php - api/facturacion/src/afip.php-master/examples/CreateVoucher.php
- PASS: STATIC-0021 - include ../php/conexion_starlim_be.php - api/frontend/facturacion.php
- BLOCKED: E2E-0207 - safe write flow gate - Facturacion fiscal authorization

## Administracion
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Auditoria
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Produccion de solo lectura
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Riesgos criticos
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Brechas de cobertura
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Recomendaciones priorizadas
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Detalle de BLOCKED

### STATIC-0001 - php -l syntax
- Motivo exacto: php executable not found in PATH
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: static/php
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0202 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0203 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0204 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0205 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0206 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0207 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

## Resumen consola
```
========================================
STARLIM SYSTEM TEST
Resultado: BLOCKED
PASS: 199
FAIL: 0
BLOCKED: 7
WARNING: 1
Rutas cubiertas: 10.42%
Endpoints cubiertos: 0.0%
Reporte: reports/starlim-system-test-20260619-134434.md
========================================
```
