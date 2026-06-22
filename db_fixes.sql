-- ============================================================
-- Starlim — Correcciones de base (jun 2026)
-- Idempotente: se puede ejecutar más de una vez sin daño.
-- Reemplaza a los bloques de "migración runtime" con SHOW COLUMNS
-- (sintaxis MySQL) que fallaban silenciosamente en Postgres.
-- ============================================================

-- ── Columnas que el código asume y no están en supabase_migration.sql ──
ALTER TABLE ventas  ADD COLUMN IF NOT EXISTS seguimiento   VARCHAR(20) NOT NULL DEFAULT 'no_facturada';
ALTER TABLE ventas  ADD COLUMN IF NOT EXISTS estado_pedido VARCHAR(30) NOT NULL DEFAULT 'recibido';
ALTER TABLE remitos ADD COLUMN IF NOT EXISTS estado_pedido VARCHAR(30) NOT NULL DEFAULT 'recibido';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cbu VARCHAR(50) NOT NULL DEFAULT '';

-- ── Vista de precios calculados (la usan ver_precios.php y factura_manual.php) ──
-- precio = costo (con IVA) × multiplicador de la categoría (tabla margenes).
-- LEFT JOIN: productos sin margen quedan con precio_1 NULL y los filtra el WHERE.
CREATE OR REPLACE VIEW vista_precios AS
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
       ROUND(p.costo * m.margen_minorista, 2) AS precio_minorista
FROM productos p
LEFT JOIN margenes m ON m.codigo = p.codigo;

-- ── Normalización de rangos legacy (no pasan ningún chequeo actual) ──
UPDATE usuarios SET rango = 'Empleado_1' WHERE rango = 'Empleado1';
UPDATE usuarios SET rango = 'Empleado_2' WHERE rango = 'Empleado2';
UPDATE usuarios SET rango = 'Jefe'       WHERE rango = 'Jefe0';

-- ── Índices (las tablas grandes no tenían ninguno) ──
CREATE INDEX IF NOT EXISTS idx_ventas_fecha           ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_dni_cliente     ON ventas(dni_cliente);
CREATE INDEX IF NOT EXISTS idx_ventas_estado_cobro    ON ventas(estado_cobro);
CREATE INDEX IF NOT EXISTS idx_ventas_nro_comprobante ON ventas(nro_comprobante);
CREATE INDEX IF NOT EXISTS idx_ventas_cobros_panel ON ventas(fecha DESC, id DESC)
WHERE COALESCE(estado_pedido,'entregado') = 'entregado'
  AND COALESCE(estado_cobro,'pendiente') NOT IN ('recibido','cancelado');
CREATE INDEX IF NOT EXISTS idx_ventas_cobro_vencimiento ON ventas(vencimiento_cobro)
WHERE COALESCE(estado_cobro,'pendiente') = 'pendiente'
  AND COALESCE(estado_pedido,'entregado') = 'entregado'
  AND vencimiento_cobro IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta   ON detalle_ventas(id_venta);
CREATE INDEX IF NOT EXISTS idx_detalle_remitos_remito ON detalle_remitos(id_remito);
CREATE INDEX IF NOT EXISTS idx_remitos_venta          ON remitos(id_venta);
CREATE INDEX IF NOT EXISTS idx_remitos_venta_id       ON remitos(id_venta, id);
CREATE INDEX IF NOT EXISTS idx_remitos_fecha          ON remitos(fecha);
CREATE INDEX IF NOT EXISTS idx_productos_codigo       ON productos(codigo);
CREATE INDEX IF NOT EXISTS idx_productos_nombre       ON productos(nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre        ON clientes(nombre_cliente);
CREATE INDEX IF NOT EXISTS idx_clientes_nro_id        ON clientes(nro_id);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor      ON compras_registro(id_proveedor);
CREATE INDEX IF NOT EXISTS idx_mensajes_para_leido    ON mensajes(para, leido);
CREATE INDEX IF NOT EXISTS idx_cc_entidad             ON cuentas_corrientes(entidad_nombre);
CREATE INDEX IF NOT EXISTS idx_cc_origen_tipo         ON cuentas_corrientes(tipo_origen, id_origen);
CREATE INDEX IF NOT EXISTS idx_tareas_asignado_a      ON tareas_asignadas(asignado_a);

-- ── Modo Administrador de ventas_registradas.php (jun 2026) ──
-- Registro de actividad: quién, cuándo, qué venta y cambios antes/después
-- (mismo patrón que stock_modificaciones). La contraseña del modo admin vive
-- en config_sistema bajo 'password_modo_admin_ventas'; el backend la siembra
-- con '0000' hasheado la primera vez que se usa.
CREATE TABLE IF NOT EXISTS ventas_modificaciones (
    id          SERIAL          PRIMARY KEY,
    empleado    VARCHAR(100)    NOT NULL DEFAULT '',
    venta_id    INT             NOT NULL DEFAULT 0,
    venta_label VARCHAR(255)    NOT NULL DEFAULT '',
    accion      VARCHAR(50)     NOT NULL DEFAULT 'edicion',
    cambios     TEXT            NOT NULL DEFAULT '[]',
    fecha       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ventas_modif_fecha ON ventas_modificaciones(fecha);

-- ── Costos y ganancias por venta (jun 2026) ──
-- Cargados desde la planilla "ENTREGAS ANUAL" (carga maestra del 12/6/2026,
-- backup previo en ventas_backup_20260612). Solo visibles para Admin/Jefe1
-- cuando se implemente la vista por roles. ganancia = monto − costo.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS costo    DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS ganancia DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ============================================================
-- Circuito Pedidos → Ventas (jun 2026)
-- Ciclo de ventas.estado_pedido: recibido → en_proceso →
-- pendiente_entrega → entregado. Una venta es "real" (aparece en
-- Ventas, cuenta en cobros y descuenta stock) recién al entregarse.
-- OJO: la migración del histórico (valores viejos → 'entregado') es
-- one-shot y NO vive acá, porque 'recibido' cambió de significado
-- (antes = entregado, ahora = pedido recién ingresado).
-- ============================================================
ALTER TABLE ventas  ALTER COLUMN estado_pedido SET DEFAULT 'recibido';
ALTER TABLE remitos ALTER COLUMN estado_pedido SET DEFAULT 'recibido';

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS observacion         TEXT        NOT NULL DEFAULT '';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS creado_en           TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comprobante_deseado VARCHAR(20) NOT NULL DEFAULT 'remito'; -- remito
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS vencimiento_cobro   TIMESTAMP;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_metodo VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_monto_registrado DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_fecha DATE;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_destino VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_operacion VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_notas TEXT NOT NULL DEFAULT '';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_registrado_por VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_registrado_at TIMESTAMP;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_aprobado_por VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobro_aprobado_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_ventas_estado_pedido    ON ventas(estado_pedido);
CREATE INDEX IF NOT EXISTS idx_ventas_cobros_aprobacion ON ventas(cobro_registrado_at DESC, id DESC)
WHERE COALESCE(estado_cobro,'pendiente') IN ('pendiente_aprobacion','en_proceso')
  AND COALESCE(estado_pedido,'entregado') = 'entregado';
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_producto ON detalle_ventas(id_producto);

-- Stock real vs disponible: el real es productos.stock (físico en las
-- instalaciones); el disponible descuenta lo reservado por pedidos vivos
-- que todavía no descontaron stock (se descuenta al entregar).
CREATE OR REPLACE VIEW vista_stock_disponible AS
SELECT p.id, p.id_producto, p.codigo, p.rubro, p.categoria, p.proveedor,
       p.nombre, p.costo, p.descripcion, p.imagen,
       p.stock                              AS stock_real,
       COALESCE(rsv.reservado, 0)           AS reservado,
       p.stock - COALESCE(rsv.reservado, 0) AS disponible
FROM productos p
LEFT JOIN (
    SELECT dv.id_producto, SUM(dv.cantidad) AS reservado
    FROM detalle_ventas dv
    JOIN ventas v ON v.id = dv.id_venta
    WHERE v.estado_pedido IN ('recibido', 'en_proceso', 'pendiente_entrega')
      AND COALESCE(v.stock_descontado, 0) = 0
    GROUP BY dv.id_producto
) rsv ON rsv.id_producto = p.id;

-- Plazo de pago acordado por cliente (días). Autocompleta el "Vencimiento del cobro"
-- al cargar un pedido/venta. 0 = sin plazo (se deja vacío).
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS plazo_pago_dias SMALLINT NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS solicitudes_factura;

-- Notas internas de credito/debito sobre ventas entregadas o remitos standalone.
-- No emiten ARCA ni CAE. NC devuelve stock, ND lo resta.
-- El saldo a cobrar se netea via cuentas_corrientes (NC haber, ND debe).


CREATE TABLE IF NOT EXISTS comprobantes_venta (
    id              SERIAL        PRIMARY KEY,
    id_venta        INT,                                -- NULL si es sobre remito standalone
    id_remito       INT,                                -- solo para standalone legacy
    clase           VARCHAR(2)    NOT NULL,             -- 'NC' | 'ND'
    fiscal          SMALLINT      NOT NULL DEFAULT 0,   -- siempre 0: interna
    tipo_cbte       INT           NOT NULL DEFAULT 0,   -- 0 si interna
    nro_comprobante INT           NOT NULL DEFAULT 0,
    cae             VARCHAR(30)   NOT NULL DEFAULT '',
    vencimiento_cae VARCHAR(20)   NOT NULL DEFAULT '',
    monto           DECIMAL(12,2) NOT NULL DEFAULT 0,
    detalle_json    TEXT          NOT NULL DEFAULT '[]',
    motivo          TEXT          NOT NULL DEFAULT '',
    stock_ajustado  SMALLINT      NOT NULL DEFAULT 0,
    creado_por      VARCHAR(100)  NOT NULL DEFAULT '',
    creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comprobantes_venta_venta  ON comprobantes_venta(id_venta);
CREATE INDEX IF NOT EXISTS idx_comprobantes_venta_remito ON comprobantes_venta(id_remito);

-- ============================================================
-- Logística: rutas de reparto (jun 2026)
-- Desde Pedidos se arman rutas de entrega para un repartidor (empleado) y se
-- le avisa por WhatsApp. Solo se rutean pedidos 'pendiente_entrega'.
-- ============================================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(30) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS repartos (
    id                  SERIAL       PRIMARY KEY,
    repartidor_nombre   VARCHAR(150) NOT NULL DEFAULT '',
    repartidor_telefono VARCHAR(30)  NOT NULL DEFAULT '',
    fecha               DATE         NOT NULL DEFAULT CURRENT_DATE,
    creado_por          VARCHAR(100) NOT NULL DEFAULT '',
    creado_en           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reparto_pedidos (
    id         SERIAL PRIMARY KEY,
    id_reparto INT NOT NULL,
    id_venta   INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reparto_pedidos_reparto ON reparto_pedidos(id_reparto);
CREATE INDEX IF NOT EXISTS idx_reparto_pedidos_venta   ON reparto_pedidos(id_venta);

-- ── Presupuestos (creados desde Ventas › Presupuestos) ──
-- Antes generar_presupuesto.php traía un CREATE TABLE con sintaxis MySQL;
-- el esquema canónico vive acá (la app ya no depende de ese DDL).
CREATE TABLE IF NOT EXISTS presupuestos (
    id                   SERIAL        PRIMARY KEY,
    fecha_emision        DATE          NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento    DATE          NOT NULL,
    cliente_nombre       VARCHAR(200)  NOT NULL DEFAULT '',
    cliente_razon_social VARCHAR(200)  NOT NULL DEFAULT '',
    cliente_domicilio    VARCHAR(200)  NOT NULL DEFAULT '',
    cliente_telefono     VARCHAR(100)  NOT NULL DEFAULT '',
    cliente_cond_iva     VARCHAR(100)  NOT NULL DEFAULT '',
    cliente_cuit         VARCHAR(50)   NOT NULL DEFAULT '',
    lista_activa         SMALLINT      NOT NULL DEFAULT 0,
    descuento_pct        DECIMAL(5,2)  NOT NULL DEFAULT 0,
    incluir_iva          SMALLINT      NOT NULL DEFAULT 1,
    neto_agravado        DECIMAL(12,2) NOT NULL DEFAULT 0,
    desc_monto           DECIMAL(12,2) NOT NULL DEFAULT 0,
    subtotal             DECIMAL(12,2) NOT NULL DEFAULT 0,
    iva_monto            DECIMAL(12,2) NOT NULL DEFAULT 0,
    total                DECIMAL(12,2) NOT NULL DEFAULT 0,
    productos_json       TEXT          NOT NULL DEFAULT '[]',
    estado               VARCHAR(20)   NOT NULL DEFAULT 'pendiente',  -- pendiente | aceptada | denegada
    creado_por           VARCHAR(100)  NOT NULL DEFAULT '',
    created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_presupuestos_estado ON presupuestos(estado);
CREATE INDEX IF NOT EXISTS idx_presupuestos_vto    ON presupuestos(fecha_vencimiento);

-- ── Empleados y permisos granulares ─────────────────────────────────────
-- usuarios sigue siendo la tabla de autenticacion. Estas columnas agregan el
-- perfil operativo del empleado sin romper login/rangos existentes.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apellido VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dni VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_ingreso DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS observaciones TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS app_roles (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    activo SMALLINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_permisos (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(80) NOT NULL UNIQUE,
    modulo VARCHAR(50) NOT NULL,
    accion VARCHAR(50) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS app_rol_permisos (
    id_rol INT NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    id_permiso INT NOT NULL REFERENCES app_permisos(id) ON DELETE CASCADE,
    PRIMARY KEY (id_rol, id_permiso)
);

CREATE TABLE IF NOT EXISTS app_usuario_roles (
    id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    id_rol INT NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (id_usuario, id_rol)
);

CREATE TABLE IF NOT EXISTS app_usuario_permisos (
    id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    id_permiso INT NOT NULL REFERENCES app_permisos(id) ON DELETE CASCADE,
    PRIMARY KEY (id_usuario, id_permiso)
);

INSERT INTO app_permisos (clave, modulo, accion, nombre)
VALUES ('cobranzas.aprobar', 'cobranzas', 'aprobar', 'Aprobar cobros registrados')
ON CONFLICT (clave) DO UPDATE
SET modulo = EXCLUDED.modulo,
    accion = EXCLUDED.accion,
    nombre = EXCLUDED.nombre;

INSERT INTO app_rol_permisos (id_rol, id_permiso)
SELECT r.id, p.id
FROM app_roles r
JOIN app_permisos p ON p.clave = 'cobranzas.aprobar'
WHERE r.clave IN ('Jefe1', 'Admin')
ON CONFLICT DO NOTHING;
