-- Inicializa contadores con los maximos actuales.
-- app_private.next_sequence devuelve max + 1 despues de este seed.

INSERT INTO public.secuencias_empresa (empresa_id, tipo, valor)
VALUES
    (1, 'nro_remito', COALESCE((SELECT MAX(nro_remito) FROM public.remitos WHERE empresa_id = 1), 0)),
    (1, 'nro_comprobante', COALESCE((SELECT MAX(nro_comprobante) FROM public.ventas WHERE empresa_id = 1), 0)),
    (1, 'comprobante_venta', COALESCE((SELECT MAX(nro_comprobante) FROM public.comprobantes_venta WHERE empresa_id = 1), 0)),
    (1, 'presupuesto', COALESCE((SELECT MAX(id) FROM public.presupuestos WHERE empresa_id = 1), 0)),
    (1, 'reparto', COALESCE((SELECT MAX(id) FROM public.repartos WHERE empresa_id = 1), 0))
ON CONFLICT (empresa_id, tipo) DO UPDATE
SET valor = GREATEST(public.secuencias_empresa.valor, EXCLUDED.valor),
    updated_at = CURRENT_TIMESTAMP;
