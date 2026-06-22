-- Indices por empresa_id y vistas compatibles con tenant.

DO $$
DECLARE
    v_table TEXT;
    v_tables TEXT[] := ARRAY[
        'rubros',
        'productos',
        'margenes',
        'listas_precio',
        'margenes_listas',
        'clientes',
        'operadores',
        'ventas',
        'detalle_ventas',
        'remitos',
        'detalle_remitos',
        'presupuestos',
        'proveedores',
        'compras_registro',
        'detalle_compras_registro',
        'cuentas_corrientes',
        'pagos_registro',
        'costos_operativos',
        'mensajes',
        'recordatorios',
        'tareas_asignadas',
        'stock_modificaciones',
        'ventas_modificaciones',
        'comprobantes_venta',
        'repartos',
        'reparto_pedidos',
        'eventos_integracion',
        'solicitudes_factura',
        'config_sistema',
        'app_usuario_roles',
        'app_usuario_permisos'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON public.%I (empresa_id)',
                left('idx_' || v_table || '_empresa_id', 63),
                v_table
            );
        END IF;
    END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_productos_empresa_codigo
    ON public.productos (empresa_id, codigo);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nro_id
    ON public.clientes (empresa_id, nro_id);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nombre
    ON public.clientes (empresa_id, nombre_cliente);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_fecha
    ON public.ventas (empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_nro_comprobante
    ON public.ventas (empresa_id, nro_comprobante);
CREATE INDEX IF NOT EXISTS idx_remitos_empresa_nro_remito
    ON public.remitos (empresa_id, nro_remito);
CREATE INDEX IF NOT EXISTS idx_comprobantes_empresa_nro
    ON public.comprobantes_venta (empresa_id, nro_comprobante);

CREATE OR REPLACE VIEW public.vista_precios AS
SELECT p.id,
       p.id_producto,
       p.codigo,
       p.nombre,
       p.costo,
       p.stock,
       ROUND(p.costo * m.precio_0, 2)         AS precio_0,
       ROUND(p.costo * m.precio_1, 2)         AS precio_1,
       ROUND(p.costo * m.precio_2, 2)         AS precio_2,
       ROUND(p.costo * m.precio_3, 2)         AS precio_3,
       ROUND(p.costo * m.margen_minorista, 2) AS precio_minorista,
       p.empresa_id
FROM public.productos p
LEFT JOIN public.margenes m
       ON m.empresa_id = p.empresa_id
      AND m.codigo = p.codigo
WHERE p.empresa_id = COALESCE(app_private.current_empresa_id(1), 1);

CREATE OR REPLACE VIEW public.vista_stock_disponible AS
SELECT p.id,
       p.id_producto,
       p.codigo,
       p.rubro,
       p.categoria,
       p.proveedor,
       p.nombre,
       p.costo,
       p.descripcion,
       p.imagen,
       p.stock                              AS stock_real,
       COALESCE(rsv.reservado, 0)           AS reservado,
       p.stock - COALESCE(rsv.reservado, 0) AS disponible,
       p.empresa_id
FROM public.productos p
LEFT JOIN (
    SELECT v.empresa_id, dv.id_producto, SUM(dv.cantidad) AS reservado
    FROM public.detalle_ventas dv
    JOIN public.ventas v ON v.id = dv.id_venta
    WHERE v.estado_pedido IN ('recibido', 'en_proceso', 'pendiente_entrega')
      AND COALESCE(v.stock_descontado, 0) = 0
    GROUP BY v.empresa_id, dv.id_producto
) rsv ON rsv.empresa_id = p.empresa_id
     AND rsv.id_producto = p.id
WHERE p.empresa_id = COALESCE(app_private.current_empresa_id(1), 1);
