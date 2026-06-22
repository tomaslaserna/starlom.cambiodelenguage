RESULTADO GLOBAL: BLOCKED

- Fecha y hora: 2026-06-20T20:29:51.962557
- Rama: security/hardening-2026-06-19
- Commit: 1e5d62aeadbaab4b9104c08f1faeb2746cc06664
- Entorno probado: repo local + Supabase configurado + produccion solo lectura
- URL probada: https://star-lim-phi.vercel.app
- Base/proyecto: Supabase configurado por variables locales (valores redactados)
- PASS: 126
- FAIL: 0
- BLOCKED: 8
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
| STATIC-0093 | static | includes | `api/php/generar_pdf_precios.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_precios.php |
| STATIC-0094 | static | includes | `api/php/generar_pdf_precios.php` | include ../fpdf186/fpdf.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_precios.php |
| STATIC-0095 | static | includes | `api/php/generar_pdf_remito.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_pdf_remito.php |
| STATIC-0096 | static | includes | `api/php/generar_presupuesto.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_presupuesto.php |
| STATIC-0097 | static | includes | `api/php/generar_presupuesto.php` | include presupuesto_pdf_lib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_presupuesto.php |
| STATIC-0098 | static | includes | `api/php/generar_remito_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/generar_remito_venta.php |
| STATIC-0099 | static | includes | `api/php/get_cliente.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_cliente.php |
| STATIC-0100 | static | includes | `api/php/get_clientes.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_clientes.php |
| STATIC-0101 | static | includes | `api/php/get_comprobantes_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_comprobantes_venta.php |
| STATIC-0102 | static | includes | `api/php/get_comprobantes_venta.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_comprobantes_venta.php |
| STATIC-0103 | static | includes | `api/php/get_detalle_remito.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_detalle_remito.php |
| STATIC-0104 | static | includes | `api/php/get_detalle_venta.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_detalle_venta.php |
| STATIC-0105 | static | includes | `api/php/get_facturas_cliente.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_facturas_cliente.php |
| STATIC-0106 | static | includes | `api/php/get_resumen_global.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_resumen_global.php |
| STATIC-0107 | static | includes | `api/php/get_vendedores.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/get_vendedores.php |
| STATIC-0108 | static | includes | `api/php/importar_clientes_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/importar_clientes_be.php |
| STATIC-0109 | static | includes | `api/php/importar_precios_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/importar_precios_be.php |
| STATIC-0110 | static | includes | `api/php/importar_productos_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/importar_productos_be.php |
| STATIC-0111 | static | includes | `api/php/login_usuario_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/login_usuario_be.php |
| STATIC-0112 | static | includes | `api/php/marcar_mensajes_leidos.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/marcar_mensajes_leidos.php |
| STATIC-0113 | static | includes | `api/php/modo_admin_ventas_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/modo_admin_ventas_be.php |
| STATIC-0114 | static | includes | `api/php/modo_admin_ventas_be.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/modo_admin_ventas_be.php |
| STATIC-0115 | static | includes | `api/php/nav_mensajes_data.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/nav_mensajes_data.php |
| STATIC-0116 | static | includes | `api/php/proveedores_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/proveedores_be.php |
| STATIC-0117 | static | includes | `api/php/proveedores_be.php` | include auth.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/proveedores_be.php |
| STATIC-0118 | static | includes | `api/php/stock_upload_be.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/stock_upload_be.php |
| STATIC-0119 | static | includes | `api/php/ver_presupuesto_pdf.php` | include conexion_starlim_be.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/ver_presupuesto_pdf.php |
| STATIC-0120 | static | includes | `api/php/ver_presupuesto_pdf.php` | include presupuesto_pdf_lib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/php/ver_presupuesto_pdf.php |
| STATIC-0121 | static | includes | `api/phpqrcode/index.php` | include qrlib.php | PASS | Include target resolvable or dynamic documented | exists | 0ms | api/phpqrcode/index.php |
| SEC-0122 | static | secrets | `repository` | secret pattern scan | WARNING | No obvious secrets committed | 5 files flagged: ['.env.example', '.env.smoke.example', 'api/facturacion/src/afip.php-master/src/Afip.php', 'api/php/storage_supabase.php', 'reports/starlim-inventory.json'] | 0ms | rg-like scan |
| DB-0123 | database | connectivity | `Supabase` | SELECT 1 | BLOCKED | DB connection using configured env | pg8000 unavailable: No module named 'pg8000' | 0ms | env/db |
| PROD-0124 | production-readonly | http | `/` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=308; location=/frontend/index.php; php_error=False | 513ms | https://star-lim-phi.vercel.app/ |
| PROD-0125 | production-readonly | http | `/frontend/index.php` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=200; location=; php_error=False | 426ms | https://star-lim-phi.vercel.app/frontend/index.php |
| PROD-0126 | production-readonly | http | `/frontend/sign.php` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=200; location=; php_error=False | 323ms | https://star-lim-phi.vercel.app/frontend/sign.php |
| PROD-0127 | production-readonly | http | `/frontend/panel_empleados.php` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=302; location=sign.php?expired=1; php_error=False | 509ms | https://star-lim-phi.vercel.app/frontend/panel_empleados.php |
| PROD-0128 | production-readonly | http | `/frontend/admin_conciliacion_bancaria.php` | GET route smoke | PASS | 200/308 for public, 302/401/403 for protected | status=302; location=sign.php?expired=1; php_error=False | 347ms | https://star-lim-phi.vercel.app/frontend/admin_conciliacion_bancaria.php |
| PROD-0129 | production-readonly | tls | `star-lim-phi.vercel.app` | TLS certificate | PASS | valid certificate returned | Jul 27 02:04:42 2026 GMT | 0ms | ssl |
| E2E-0130 | e2e/business | safe-write-flows | `Admin login E2E` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0131 | e2e/business | safe-write-flows | `Limited user E2E` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0132 | e2e/business | safe-write-flows | `Cliente-presupuesto-venta-entrega-cobro` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0133 | e2e/business | safe-write-flows | `Compra-stock-pago` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0134 | e2e/business | safe-write-flows | `Conciliacion bancaria write flow` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |
| E2E-0135 | e2e/business | safe-write-flows | `Facturacion fiscal authorization` | safe write flow gate | BLOCKED | Safe test/staging credentials and writable test tenant | No non-production writable environment or test credentials were provided; production is read-only by prompt. | 0ms | safety gate |

## Build y analisis estatico
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Base de datos
- PASS: STATIC-0031 - include ../php/conexion_starlim_be.php - api/frontend/panel_base_datos.php
- BLOCKED: DB-0123 - SELECT 1 - Supabase

## Backend
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Autenticacion y sesiones
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Permisos
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

## Multiempresa
- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.

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
- PASS: STATIC-0113 - include conexion_starlim_be.php - api/php/modo_admin_ventas_be.php
- PASS: STATIC-0114 - include auth.php - api/php/modo_admin_ventas_be.php

## Stock
- PASS: STATIC-0019 - include ../php/conexion_starlim_be.php - api/frontend/edit_stock.php
- PASS: STATIC-0030 - include ../php/conexion_starlim_be.php - api/frontend/new_stock.php
- PASS: STATIC-0042 - include ../php/conexion_starlim_be.php - api/frontend/recontar_stock.php
- PASS: STATIC-0044 - include ../php/conexion_starlim_be.php - api/frontend/registro_stock.php
- PASS: STATIC-0047 - include ../php/conexion_starlim_be.php - api/frontend/stock.php
- PASS: STATIC-0054 - include pedido_stock.php - api/php/actualizar_campo_venta.php
- PASS: STATIC-0059 - include pedido_stock.php - api/php/actualizar_estado_pedido.php
- PASS: STATIC-0065 - include conexion_starlim_be.php - api/php/actualizar_stock_be.php
- PASS: STATIC-0118 - include conexion_starlim_be.php - api/php/stock_upload_be.php
- BLOCKED: E2E-0133 - safe write flow gate - Compra-stock-pago

## Compras
- PASS: STATIC-0018 - include ../php/conexion_starlim_be.php - api/frontend/compras.php
- PASS: STATIC-0074 - include conexion_starlim_be.php - api/php/compras_foto_recibo.php
- PASS: STATIC-0075 - include conexion_starlim_be.php - api/php/compras_paquete_ajax.php

## Cobros y cuentas corrientes
- PASS: STATIC-0032 - include ../php/conexion_starlim_be.php - api/frontend/panel_cobros_pagos.php

## Tesoreria y cash flow
- PASS: STATIC-0015 - include ../php/conexion_starlim_be.php - api/frontend/admin_tesoreria.php

## Conciliacion bancaria
- PASS: STATIC-0008 - include ../php/conexion_starlim_be.php - api/frontend/admin_conciliacion_bancaria.php
- PASS: PROD-0128 - GET route smoke - /frontend/admin_conciliacion_bancaria.php
- BLOCKED: E2E-0134 - safe write flow gate - Conciliacion bancaria write flow

## Facturacion
- PASS: STATIC-0003 - include ../src/Afip.php - api/facturacion/src/afip.php-master/examples/CreateVoucher.php
- PASS: STATIC-0021 - include ../php/conexion_starlim_be.php - api/frontend/facturacion.php
- BLOCKED: E2E-0135 - safe write flow gate - Facturacion fiscal authorization

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

### DB-0123 - SELECT 1
- Motivo exacto: pg8000 unavailable: No module named 'pg8000'
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: database/connectivity
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0130 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0131 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0132 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0133 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0134 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

### E2E-0135 - safe write flow gate
- Motivo exacto: No non-production writable environment or test credentials were provided; production is read-only by prompt.
- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.
- Pruebas afectadas: e2e/business/safe-write-flows
- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.

## Resumen consola
```
========================================
STARLIM SYSTEM TEST
Resultado: BLOCKED
PASS: 126
FAIL: 0
BLOCKED: 8
WARNING: 1
Rutas cubiertas: 10.42%
Endpoints cubiertos: 0.0%
Reporte: reports/starlim-system-test-20260620-202948.md
========================================
```
