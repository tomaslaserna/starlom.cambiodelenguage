-- ============================================================
-- Star Lim — Migración MySQL → PostgreSQL (Supabase)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Tabla de sesiones PHP (serverless Vercel)
CREATE TABLE IF NOT EXISTS php_sessions (
    session_id   VARCHAR(128) PRIMARY KEY,
    session_data TEXT         NOT NULL DEFAULT '',
    expires_at   TIMESTAMP    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_php_sessions_expires ON php_sessions(expires_at);

-- ────────────────────────────────────────────────────────────
-- Usuarios y autenticación
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id              SERIAL       PRIMARY KEY,
    nombre_completo VARCHAR(255) NOT NULL DEFAULT '',
    correo          VARCHAR(255) NOT NULL UNIQUE,
    usuario         VARCHAR(100) NOT NULL UNIQUE,
    contrasena      VARCHAR(255) NOT NULL,
    rango           VARCHAR(50)  NOT NULL DEFAULT 'Minorista'
);

-- ────────────────────────────────────────────────────────────
-- Catálogo de productos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rubros (
    codigo VARCHAR(20)  PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS productos (
    id          SERIAL          PRIMARY KEY,
    id_producto INT             NOT NULL DEFAULT 0,
    rubro       VARCHAR(50)     NOT NULL DEFAULT '',
    codigo      VARCHAR(50)     NOT NULL DEFAULT '',
    categoria   VARCHAR(100)    NOT NULL DEFAULT '',
    proveedor   VARCHAR(255)    NOT NULL DEFAULT '',
    nombre      VARCHAR(255)    NOT NULL,
    costo       DECIMAL(12,2)   NOT NULL DEFAULT 0,
    stock       INT             NOT NULL DEFAULT 0,
    descripcion TEXT            NOT NULL DEFAULT '',
    imagen      VARCHAR(255)    NOT NULL DEFAULT ''
);

-- ────────────────────────────────────────────────────────────
-- Listas de precios y márgenes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS margenes (
    codigo          VARCHAR(20)  PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL DEFAULT '',
    precio_0        DECIMAL(8,4) NOT NULL DEFAULT 1,
    precio_1        DECIMAL(8,4) NOT NULL DEFAULT 1,
    precio_2        DECIMAL(8,4) NOT NULL DEFAULT 1,
    precio_3        DECIMAL(8,4) NOT NULL DEFAULT 1,
    margen_minorista DECIMAL(8,4) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS listas_precio (
    id     SERIAL       PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    activa SMALLINT     NOT NULL DEFAULT 1,
    orden  INT          NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS margenes_listas (
    codigo        VARCHAR(20)  NOT NULL,
    lista_id      INT          NOT NULL,
    multiplicador DECIMAL(8,4) NOT NULL DEFAULT 1,
    PRIMARY KEY (codigo, lista_id)
);

-- ────────────────────────────────────────────────────────────
-- Clientes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
    id               SERIAL          PRIMARY KEY,
    codigo_cliente   VARCHAR(50)     NOT NULL DEFAULT '',
    nombre_cliente   VARCHAR(255)    NOT NULL DEFAULT '',
    razon_social     VARCHAR(255)    NOT NULL DEFAULT '',
    vendedor_cl      VARCHAR(100)    NOT NULL DEFAULT '',
    tipo_id          VARCHAR(20)     NOT NULL DEFAULT '',
    nro_id           VARCHAR(30)     NOT NULL DEFAULT '',
    cond_iva         VARCHAR(50)     NOT NULL DEFAULT '',
    telefono         VARCHAR(30)     NOT NULL DEFAULT '',
    estado           VARCHAR(50)     NOT NULL DEFAULT 'activo',
    domicilio        VARCHAR(255)    NOT NULL DEFAULT '',
    lista_precios    VARCHAR(100)    NOT NULL DEFAULT '',
    horarios         VARCHAR(255)    NOT NULL DEFAULT '',
    observacion      TEXT            NOT NULL DEFAULT '',
    comprobante      VARCHAR(100)    NOT NULL DEFAULT '',
    ultima_compra    DATE,
    antiguedad_uc    INT             NOT NULL DEFAULT 0,
    promedio_compra  DECIMAL(12,2)   NOT NULL DEFAULT 0,
    dia_recompra     DATE,
    provincia        VARCHAR(100)    NOT NULL DEFAULT '',
    ciudad           VARCHAR(100)    NOT NULL DEFAULT '',
    sucursales       TEXT            NOT NULL DEFAULT '',
    nombre_sucursal  VARCHAR(255)    NOT NULL DEFAULT '',
    activo           VARCHAR(10)     NOT NULL DEFAULT 'true'
);

-- ────────────────────────────────────────────────────────────
-- Operadores / vendedores
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operadores (
    id                 SERIAL       PRIMARY KEY,
    nombre             VARCHAR(100) NOT NULL DEFAULT '',
    apellido           VARCHAR(100) NOT NULL DEFAULT '',
    lista_precios_fav  VARCHAR(100) NOT NULL DEFAULT ''
);

-- ────────────────────────────────────────────────────────────
-- Ventas y facturación
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventas (
    id                           SERIAL          PRIMARY KEY,
    id_producto                  INT,
    dni_cliente                  VARCHAR(30)     NOT NULL DEFAULT '',
    nombre_cliente               VARCHAR(255)    NOT NULL DEFAULT '',
    lista_precios                VARCHAR(100)    NOT NULL DEFAULT '',
    monto                        DECIMAL(12,2)   NOT NULL DEFAULT 0,
    monto_neto                   DECIMAL(12,2)   NOT NULL DEFAULT 0,
    monto_iva                    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    tipo_cbte                    INT             NOT NULL DEFAULT 6,
    cae                          VARCHAR(30)     NOT NULL DEFAULT '',
    vencimiento_cae              VARCHAR(20)     NOT NULL DEFAULT '',
    nro_comprobante              INT             NOT NULL DEFAULT 0,
    condicion_pago               VARCHAR(100)    NOT NULL DEFAULT '',
    id_operador                  INT,
    fecha                        DATE,
    vendedor                     VARCHAR(255)    NOT NULL DEFAULT '',
    estado_cobro                 VARCHAR(30)     NOT NULL DEFAULT 'pendiente',
    cobro_justificacion_proceso  VARCHAR(500)    NOT NULL DEFAULT '',
    cobro_intento_proceso_at     TIMESTAMP,
    stock_descontado             SMALLINT        NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS detalle_ventas (
    id             SERIAL          PRIMARY KEY,
    id_venta       INT             NOT NULL,
    id_producto    INT             NOT NULL,
    nombre_producto VARCHAR(255)   NOT NULL DEFAULT '',
    cantidad       INT             NOT NULL DEFAULT 1,
    precio_unit    DECIMAL(10,2)   NOT NULL DEFAULT 0,
    descuento      DECIMAL(6,2)    NOT NULL DEFAULT 0,
    subtotal       DECIMAL(12,2)   NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────
-- Remitos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS remitos (
    id               SERIAL          PRIMARY KEY,
    id_venta         INT,
    nro_remito       INT             NOT NULL,
    nombre_cliente   VARCHAR(255)    NOT NULL DEFAULT '',
    lista_precios    VARCHAR(100)    NOT NULL DEFAULT '',
    dni_cliente      VARCHAR(30)     NOT NULL DEFAULT '',
    fecha            DATE,
    id_operador      INT,
    deposito         VARCHAR(100)    NOT NULL DEFAULT '',
    sucursal_cliente VARCHAR(100)    NOT NULL DEFAULT '',
    provincia        VARCHAR(100)    NOT NULL DEFAULT '',
    observacion      TEXT            NOT NULL DEFAULT '',
    condicion_pago   VARCHAR(100)    NOT NULL DEFAULT '',
    monto            DECIMAL(12,2)   NOT NULL DEFAULT 0,
    vendedor         VARCHAR(255)    NOT NULL DEFAULT '',
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_remitos (
    id              SERIAL          PRIMARY KEY,
    id_remito       INT             NOT NULL,
    id_producto     INT             NOT NULL,
    nombre_producto VARCHAR(255)    NOT NULL DEFAULT '',
    cantidad        INT             NOT NULL DEFAULT 1,
    precio_unit     DECIMAL(10,2)   NOT NULL DEFAULT 0,
    descuento       DECIMAL(6,2)    NOT NULL DEFAULT 0,
    subtotal        DECIMAL(12,2)   NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────
-- Presupuestos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presupuestos (
    id                   SERIAL          PRIMARY KEY,
    fecha_emision        DATE,
    fecha_vencimiento    DATE,
    cliente_nombre       VARCHAR(255)    NOT NULL DEFAULT '',
    cliente_razon_social VARCHAR(255)    NOT NULL DEFAULT '',
    cliente_domicilio    VARCHAR(255)    NOT NULL DEFAULT '',
    cliente_telefono     VARCHAR(50)     NOT NULL DEFAULT '',
    cliente_cond_iva     VARCHAR(50)     NOT NULL DEFAULT '',
    cliente_cuit         VARCHAR(30)     NOT NULL DEFAULT '',
    lista_activa         SMALLINT        NOT NULL DEFAULT 0,
    descuento_pct        DECIMAL(6,2)    NOT NULL DEFAULT 0,
    incluir_iva          SMALLINT        NOT NULL DEFAULT 0,
    neto_agravado        DECIMAL(12,2)   NOT NULL DEFAULT 0,
    desc_monto           DECIMAL(12,2)   NOT NULL DEFAULT 0,
    subtotal             DECIMAL(12,2)   NOT NULL DEFAULT 0,
    iva_monto            DECIMAL(12,2)   NOT NULL DEFAULT 0,
    total                DECIMAL(12,2)   NOT NULL DEFAULT 0,
    productos_json       TEXT            NOT NULL DEFAULT '[]',
    estado               VARCHAR(20)     NOT NULL DEFAULT 'pendiente',
    creado_por           VARCHAR(100)    NOT NULL DEFAULT '',
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- Compras y proveedores
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores (
    id         SERIAL          PRIMARY KEY,
    nombre     VARCHAR(255)    NOT NULL,
    contacto   VARCHAR(100)    NOT NULL DEFAULT '',
    telefono   VARCHAR(30)     NOT NULL DEFAULT '',
    email      VARCHAR(100)    NOT NULL DEFAULT '',
    direccion  TEXT            NOT NULL DEFAULT '',
    notas      TEXT            NOT NULL DEFAULT '',
    created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compras_registro (
    id                   SERIAL          PRIMARY KEY,
    id_proveedor         INT,
    descripcion          TEXT            NOT NULL DEFAULT '',
    total                DECIMAL(12,2)   NOT NULL DEFAULT 0,
    fecha                DATE,
    estado               VARCHAR(30)     NOT NULL DEFAULT 'pendiente',
    tipo                 VARCHAR(30)     NOT NULL DEFAULT 'compra',
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stock_actualizado    SMALLINT        NOT NULL DEFAULT 0,
    estado_paquete       VARCHAR(30)     NOT NULL DEFAULT 'en_camino',
    falla_descripcion    TEXT            NOT NULL DEFAULT '',
    recibo_foto          VARCHAR(255)    NOT NULL DEFAULT '',
    correccion_descripcion TEXT          NOT NULL DEFAULT '',
    pagado               SMALLINT        NOT NULL DEFAULT 0,
    monto_pagado         DECIMAL(12,2)   NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS detalle_compras_registro (
    id          SERIAL  PRIMARY KEY,
    id_compra   INT     NOT NULL,
    id_producto INT     NOT NULL,
    cantidad    INT     NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────
-- Cobros y pagos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_corrientes (
    id             SERIAL          PRIMARY KEY,
    tipo           VARCHAR(20)     NOT NULL DEFAULT 'cliente',
    entidad_nombre VARCHAR(255)    NOT NULL DEFAULT '',
    descripcion    VARCHAR(500)    NOT NULL DEFAULT '',
    debe           DECIMAL(12,2)   NOT NULL DEFAULT 0,
    haber          DECIMAL(12,2)   NOT NULL DEFAULT 0,
    fecha          DATE,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_origen      INT,
    tipo_origen    VARCHAR(50)     NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pagos_registro (
    id                SERIAL          PRIMARY KEY,
    tipo              VARCHAR(20)     NOT NULL DEFAULT 'cobro',
    entidad_nombre    VARCHAR(255)    NOT NULL DEFAULT '',
    concepto          TEXT            NOT NULL DEFAULT '',
    monto             DECIMAL(12,2)   NOT NULL DEFAULT 0,
    fecha             DATE,
    comprobante_nombre VARCHAR(255)   NOT NULL DEFAULT '',
    notas             TEXT            NOT NULL DEFAULT '',
    created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_origen         INT,
    tipo_origen       VARCHAR(50)     NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS costos_operativos (
    id         SERIAL          PRIMARY KEY,
    concepto   VARCHAR(255)    NOT NULL DEFAULT '',
    monto      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    categoria  VARCHAR(100)    NOT NULL DEFAULT '',
    fecha      DATE,
    created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- Mensajes internos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mensajes (
    id     SERIAL          PRIMARY KEY,
    de     VARCHAR(255)    NOT NULL,
    para   VARCHAR(255)    NOT NULL,
    asunto VARCHAR(255)    NOT NULL DEFAULT '',
    cuerpo TEXT            NOT NULL,
    fecha  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    leido  SMALLINT        NOT NULL DEFAULT 0,
    tipo   VARCHAR(50)     NOT NULL DEFAULT 'normal'
);
CREATE INDEX IF NOT EXISTS idx_mensajes_para ON mensajes(para);

-- ────────────────────────────────────────────────────────────
-- Recordatorios y tareas
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recordatorios (
    id              SERIAL          PRIMARY KEY,
    titulo          VARCHAR(255)    NOT NULL DEFAULT '',
    descripcion     TEXT            NOT NULL DEFAULT '',
    prioridad       VARCHAR(20)     NOT NULL DEFAULT 'normal',
    fecha_creacion  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_limite    TIMESTAMP,
    completado      SMALLINT        NOT NULL DEFAULT 0,
    usuario         VARCHAR(100)    NOT NULL DEFAULT '',
    fecha_envio     TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tareas_asignadas (
    id                  SERIAL          PRIMARY KEY,
    titulo              VARCHAR(255)    NOT NULL DEFAULT '',
    descripcion         TEXT            NOT NULL DEFAULT '',
    prioridad           VARCHAR(20)     NOT NULL DEFAULT 'normal',
    fecha_limite        TIMESTAMP,
    fecha_envio         TIMESTAMP,
    asignado_por        VARCHAR(100)    NOT NULL DEFAULT '',
    asignado_a          VARCHAR(100)    NOT NULL DEFAULT '',
    completado          SMALLINT        NOT NULL DEFAULT 0,
    mensaje_completado  TEXT            NOT NULL DEFAULT '',
    fecha_creacion      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_completado    TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- Modificaciones de stock (historial)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_modificaciones (
    id               SERIAL          PRIMARY KEY,
    empleado         VARCHAR(100)    NOT NULL DEFAULT '',
    producto_id      INT             NOT NULL,
    producto_nombre  VARCHAR(255)    NOT NULL DEFAULT '',
    cambios          TEXT            NOT NULL DEFAULT '{}',
    justificacion    TEXT            NOT NULL DEFAULT '',
    fecha            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- Configuración del sistema
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_sistema (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT         NOT NULL DEFAULT ''
);

-- Contraseña de carga masiva (cambiar el hash por el real)
-- Generar hash en PHP: password_hash('tu_contraseña', PASSWORD_DEFAULT)
INSERT INTO config_sistema (clave, valor)
VALUES ('password_carga_masiva', '$2y$10$REEMPLAZAR_CON_HASH_REAL')
ON CONFLICT (clave) DO NOTHING;
