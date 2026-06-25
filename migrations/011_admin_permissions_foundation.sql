-- Administracion - permisos granulares y auditoria.
-- Etapa 1: base aditiva, sin modificar datos operativos ni habilitar pantallas nuevas.

CREATE TABLE IF NOT EXISTS public.admin_resources (
    clave VARCHAR(80) PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    ruta VARCHAR(180) NOT NULL DEFAULT '',
    orden INT NOT NULL DEFAULT 0,
    sensible BOOLEAN NOT NULL DEFAULT FALSE,
    fuente VARCHAR(80) NOT NULL DEFAULT 'admin',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    id_usuario INT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario VARCHAR(120) NOT NULL DEFAULT '',
    recurso VARCHAR(80) NOT NULL DEFAULT '',
    accion VARCHAR(80) NOT NULL DEFAULT '',
    objeto_tipo VARCHAR(80) NOT NULL DEFAULT '',
    objeto_id VARCHAR(120) NOT NULL DEFAULT '',
    detalle_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip INET,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_resources_activo_orden
    ON public.admin_resources (activo, orden);

CREATE INDEX IF NOT EXISTS idx_admin_audit_empresa_fecha
    ON public.admin_audit_log (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_recurso_accion
    ON public.admin_audit_log (empresa_id, recurso, accion, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_usuario
    ON public.admin_audit_log (empresa_id, id_usuario, created_at DESC);

ALTER TABLE public.admin_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admin_resources (clave, nombre, descripcion, ruta, orden, sensible, fuente)
VALUES
    ('admin.panel', 'Administracion', 'Panel principal con resumen general y filtros.', '/', 10, FALSE, 'dashboard'),
    ('admin.tesoreria', 'Tesoreria', 'Analisis de liquidez, cuentas disponibles y arqueo de caja sobre datos de cobros y pagos.', '/treasury', 20, FALSE, 'cobros_pagos'),
    ('admin.metricas', 'Metricas', 'Indicadores de negocio reutilizando la fuente de Negocio/metricas.', '/metrics', 30, FALSE, 'negocio'),
    ('admin.movimientos', 'Registros de movimientos', 'Log de acciones de empleados filtrable por usuario, fecha y accion.', '/treasury/movements', 40, FALSE, 'auditoria'),
    ('admin.cashflow', 'Cash flow', 'Flujo de caja proyectado con ingresos y egresos futuros.', '/treasury/cash-flow', 50, FALSE, 'tesoreria'),
    ('admin.balance', 'Balance', 'Balance mensual y anual con costos fijos y variables.', '/balance', 60, FALSE, 'contabilidad'),
    ('admin.dividendos', 'Dividendos', 'Distribucion a socios, retiros e historial.', '/balance/dividends', 70, TRUE, 'socios'),
    ('admin.sueldos', 'Sueldos', 'Sueldos, retiros, cuotas e historial de empleados.', '/balance/salaries', 80, TRUE, 'rrhh'),
    ('admin.calendario', 'Calendario', 'Eventos, vencimientos y recordatorios administrativos recurrentes.', '/calendar', 90, FALSE, 'recordatorios'),
    ('admin.usuarios', 'Usuarios y permisos', 'Gestion de usuarios y permisos administrativos.', '/employees', 100, TRUE, 'seguridad'),
    ('admin.obligaciones_fiscales', 'Obligaciones fiscales', 'IVA, IIBB, impuestos y vencimientos.', '/billing', 110, TRUE, 'fiscal'),
    ('admin.resultados', 'Estado de resultados', 'Vista P&L mensual: ventas menos costos y gastos.', '/balance/income-statement', 120, FALSE, 'contabilidad'),
    ('admin.cuentas_por_pagar', 'Cuentas por pagar', 'Deudas a proveedores y socios con vencimientos.', '/treasury/accounts-payable', 130, FALSE, 'tesoreria')
ON CONFLICT (clave) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    ruta = EXCLUDED.ruta,
    orden = EXCLUDED.orden,
    sensible = EXCLUDED.sensible,
    fuente = EXCLUDED.fuente,
    activo = TRUE,
    updated_at = CURRENT_TIMESTAMP;

WITH catalogo(clave, modulo, accion, nombre) AS (
    VALUES
        ('admin.panel.ver', 'admin.panel', 'ver', 'Ver Administracion'),
        ('admin.panel.editar', 'admin.panel', 'editar', 'Editar filtros/configuracion del panel'),
        ('admin.tesoreria.ver', 'admin.tesoreria', 'ver', 'Ver Tesoreria'),
        ('admin.tesoreria.editar', 'admin.tesoreria', 'editar', 'Editar arqueos y ajustes de tesoreria'),
        ('admin.metricas.ver', 'admin.metricas', 'ver', 'Ver Metricas administrativas'),
        ('admin.metricas.editar', 'admin.metricas', 'editar', 'Editar configuracion de metricas'),
        ('admin.movimientos.ver', 'admin.movimientos', 'ver', 'Ver registros de movimientos'),
        ('admin.movimientos.editar', 'admin.movimientos', 'editar', 'Administrar registros de movimientos'),
        ('admin.cashflow.ver', 'admin.cashflow', 'ver', 'Ver Cash flow'),
        ('admin.cashflow.editar', 'admin.cashflow', 'editar', 'Editar items manuales de Cash flow'),
        ('admin.balance.ver', 'admin.balance', 'ver', 'Ver Balance'),
        ('admin.balance.editar', 'admin.balance', 'editar', 'Editar costos y balance'),
        ('admin.dividendos.ver', 'admin.dividendos', 'ver', 'Ver Dividendos'),
        ('admin.dividendos.editar', 'admin.dividendos', 'editar', 'Editar Dividendos'),
        ('admin.dividendos.ver_sensible', 'admin.dividendos', 'ver_sensible', 'Ver datos sensibles de Dividendos'),
        ('admin.dividendos.editar_sensible', 'admin.dividendos', 'editar_sensible', 'Editar datos sensibles de Dividendos'),
        ('admin.sueldos.ver', 'admin.sueldos', 'ver', 'Ver Sueldos'),
        ('admin.sueldos.editar', 'admin.sueldos', 'editar', 'Editar Sueldos'),
        ('admin.sueldos.ver_sensible', 'admin.sueldos', 'ver_sensible', 'Ver datos sensibles de Sueldos'),
        ('admin.sueldos.editar_sensible', 'admin.sueldos', 'editar_sensible', 'Editar datos sensibles de Sueldos'),
        ('admin.calendario.ver', 'admin.calendario', 'ver', 'Ver Calendario administrativo'),
        ('admin.calendario.editar', 'admin.calendario', 'editar', 'Editar eventos del Calendario'),
        ('admin.usuarios.ver', 'admin.usuarios', 'ver', 'Ver Usuarios y permisos'),
        ('admin.usuarios.editar', 'admin.usuarios', 'editar', 'Editar Usuarios y permisos'),
        ('admin.usuarios.ver_sensible', 'admin.usuarios', 'ver_sensible', 'Ver datos sensibles de Usuarios'),
        ('admin.usuarios.editar_sensible', 'admin.usuarios', 'editar_sensible', 'Editar datos sensibles de Usuarios'),
        ('admin.obligaciones_fiscales.ver', 'admin.obligaciones_fiscales', 'ver', 'Ver Obligaciones fiscales'),
        ('admin.obligaciones_fiscales.editar', 'admin.obligaciones_fiscales', 'editar', 'Editar Obligaciones fiscales'),
        ('admin.obligaciones_fiscales.ver_sensible', 'admin.obligaciones_fiscales', 'ver_sensible', 'Ver datos fiscales sensibles'),
        ('admin.obligaciones_fiscales.editar_sensible', 'admin.obligaciones_fiscales', 'editar_sensible', 'Editar datos fiscales sensibles'),
        ('admin.resultados.ver', 'admin.resultados', 'ver', 'Ver Estado de resultados'),
        ('admin.resultados.editar', 'admin.resultados', 'editar', 'Editar Estado de resultados'),
        ('admin.cuentas_por_pagar.ver', 'admin.cuentas_por_pagar', 'ver', 'Ver Cuentas por pagar'),
        ('admin.cuentas_por_pagar.editar', 'admin.cuentas_por_pagar', 'editar', 'Editar Cuentas por pagar')
)
INSERT INTO public.app_permisos (clave, modulo, accion, nombre)
SELECT clave, modulo, accion, nombre
FROM catalogo
ON CONFLICT (clave) DO UPDATE
SET modulo = EXCLUDED.modulo,
    accion = EXCLUDED.accion,
    nombre = EXCLUDED.nombre;

INSERT INTO public.app_rol_permisos (id_rol, id_permiso)
SELECT r.id, p.id
FROM public.app_roles r
JOIN public.app_permisos p ON p.clave LIKE 'admin.%'
WHERE r.clave = 'Admin'
ON CONFLICT DO NOTHING;
