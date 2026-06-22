-- Agrega empresa_id con DEFAULT 1 en tablas de negocio reales.
-- No activa RLS y no elimina datos.

DO $$
DECLARE
    v_table TEXT;
    v_constraint TEXT;
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
                'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1',
                v_table
            );

            EXECUTE format(
                'UPDATE public.%I SET empresa_id = 1 WHERE empresa_id IS NULL',
                v_table
            );

            v_constraint := left(v_table || '_empresa_id_fkey', 63);
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conrelid = format('public.%I', v_table)::regclass
                  AND conname = v_constraint
            ) THEN
                EXECUTE format(
                    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) NOT VALID',
                    v_table,
                    v_constraint
                );
            END IF;
        END IF;
    END LOOP;
END;
$$;
