<?php
/**
 * empleados_lib.php - Esquema y catalogo de permisos para Gestion de Empleados.
 *
 * La autenticacion existente sigue usando usuarios.rango. Estas tablas preparan
 * permisos granulares por modulo sin romper los chequeos actuales.
 */

function starlim_empleados_catalogo_permisos(): array
{
    return [
        ['ventas', 'ver', 'Ver ventas'],
        ['ventas', 'crear', 'Crear ventas/pedidos'],
        ['ventas', 'editar', 'Editar ventas'],
        ['ventas', 'eliminar', 'Eliminar ventas'],
        ['ventas', 'exportar', 'Exportar ventas'],
        ['presupuestos', 'ver', 'Ver presupuestos'],
        ['presupuestos', 'crear', 'Crear presupuestos'],
        ['presupuestos', 'editar', 'Editar presupuestos'],
        ['presupuestos', 'aprobar', 'Aprobar presupuestos'],
        ['presupuestos', 'cancelar', 'Cancelar presupuestos'],
        ['pedidos', 'ver', 'Ver pedidos'],
        ['pedidos', 'crear', 'Crear pedidos'],
        ['pedidos', 'editar', 'Editar pedidos'],
        ['pedidos', 'cancelar', 'Cancelar pedidos'],
        ['pedidos', 'administrar', 'Administrar entregas'],
        ['cobranzas', 'ver', 'Ver cobranzas'],
        ['cobranzas', 'crear', 'Registrar cobranzas'],
        ['cobranzas', 'editar', 'Editar cobranzas'],
        ['cobranzas', 'aprobar', 'Aprobar cobros registrados'],
        ['compras', 'ver', 'Ver compras'],
        ['compras', 'crear', 'Registrar compras'],
        ['compras', 'editar', 'Editar compras'],
        ['compras', 'aprobar', 'Aprobar compras'],
        ['compras', 'cancelar', 'Cancelar compras'],
        ['stock', 'ver', 'Ver stock'],
        ['stock', 'editar', 'Modificar stock'],
        ['stock', 'administrar', 'Administrar inventario'],
        ['productos', 'ver', 'Ver productos'],
        ['productos', 'crear', 'Crear productos'],
        ['productos', 'editar', 'Editar productos'],
        ['productos', 'eliminar', 'Eliminar productos'],
        ['clientes', 'ver', 'Ver clientes'],
        ['clientes', 'crear', 'Crear clientes'],
        ['clientes', 'editar', 'Editar clientes'],
        ['clientes', 'eliminar', 'Eliminar clientes'],
        ['proveedores', 'ver', 'Ver proveedores'],
        ['proveedores', 'crear', 'Crear proveedores'],
        ['proveedores', 'editar', 'Editar proveedores'],
        ['proveedores', 'eliminar', 'Eliminar proveedores'],
        ['empleados', 'ver', 'Ver empleados'],
        ['empleados', 'crear', 'Crear empleados'],
        ['empleados', 'editar', 'Editar empleados'],
        ['empleados', 'administrar', 'Administrar permisos'],
        ['configuracion', 'ver', 'Acceder configuracion'],
        ['configuracion', 'administrar', 'Administrar configuracion'],
        ['reportes', 'ver', 'Ver reportes'],
        ['reportes', 'exportar', 'Exportar reportes'],
        ['admin.panel', 'ver', 'Ver Administracion'],
        ['admin.panel', 'editar', 'Editar filtros/configuracion del panel'],
        ['admin.tesoreria', 'ver', 'Ver Tesoreria'],
        ['admin.tesoreria', 'editar', 'Editar tesoreria, cash flow y conciliacion bancaria'],
        ['admin.metricas', 'ver', 'Ver Metricas administrativas'],
        ['admin.metricas', 'editar', 'Editar configuracion de metricas'],
        ['admin.movimientos', 'ver', 'Ver registros de movimientos'],
        ['admin.movimientos', 'editar', 'Administrar registros de movimientos'],
        ['admin.balance', 'ver', 'Ver Balance'],
        ['admin.balance', 'editar', 'Editar costos y balance'],
        ['admin.dividendos', 'ver', 'Ver Dividendos'],
        ['admin.dividendos', 'editar', 'Editar Dividendos'],
        ['admin.dividendos', 'ver_sensible', 'Ver datos sensibles de Dividendos'],
        ['admin.dividendos', 'editar_sensible', 'Editar datos sensibles de Dividendos'],
        ['admin.sueldos', 'ver', 'Ver Sueldos'],
        ['admin.sueldos', 'editar', 'Editar Sueldos'],
        ['admin.sueldos', 'ver_sensible', 'Ver datos sensibles de Sueldos'],
        ['admin.sueldos', 'editar_sensible', 'Editar datos sensibles de Sueldos'],
        ['admin.calendario', 'ver', 'Ver Calendario administrativo'],
        ['admin.calendario', 'editar', 'Editar eventos del Calendario'],
        ['admin.usuarios', 'ver', 'Ver Usuarios y permisos'],
        ['admin.usuarios', 'editar', 'Editar Usuarios y permisos'],
        ['admin.usuarios', 'ver_sensible', 'Ver datos sensibles de Usuarios'],
        ['admin.usuarios', 'editar_sensible', 'Editar datos sensibles de Usuarios'],
        ['admin.facturacion', 'ver', 'Ver Facturacion fiscal'],
        ['admin.facturacion', 'editar', 'Preparar y aprobar facturacion fiscal'],
        ['admin.facturacion', 'ver_sensible', 'Ver datos fiscales sensibles'],
        ['admin.facturacion', 'editar_sensible', 'Editar datos fiscales sensibles'],
        ['admin.resultados', 'ver', 'Ver Estado de resultados'],
        ['admin.resultados', 'editar', 'Editar Estado de resultados'],
        ['admin.cuentas_por_pagar', 'ver', 'Ver Cuentas por pagar'],
        ['admin.cuentas_por_pagar', 'editar', 'Editar Cuentas por pagar'],
    ];
}

function starlim_empleados_roles_base(): array
{
    return [
        'Empleado'   => ['nombre' => 'Empleado base', 'permisos' => ['pedidos.ver', 'stock.ver']],
        'Empleado_1' => ['nombre' => 'Deposito / stock', 'permisos' => ['pedidos.ver', 'pedidos.editar', 'stock.ver', 'stock.editar', 'productos.ver']],
        'Empleado_2' => ['nombre' => 'Ventas', 'permisos' => ['ventas.ver', 'ventas.crear', 'presupuestos.ver', 'presupuestos.crear', 'pedidos.ver', 'clientes.ver', 'stock.ver']],
        'Jefe'       => ['nombre' => 'Jefe operativo', 'permisos' => ['ventas.ver', 'ventas.crear', 'ventas.editar', 'presupuestos.ver', 'presupuestos.crear', 'presupuestos.editar', 'presupuestos.aprobar', 'pedidos.ver', 'pedidos.editar', 'pedidos.administrar', 'cobranzas.ver', 'compras.ver', 'compras.crear', 'stock.ver', 'stock.editar', 'clientes.ver', 'proveedores.ver', 'empleados.ver']],
        'Jefe1'      => ['nombre' => 'Jefe administrador', 'permisos' => ['ventas.ver', 'ventas.crear', 'ventas.editar', 'ventas.exportar', 'presupuestos.ver', 'presupuestos.crear', 'presupuestos.editar', 'presupuestos.aprobar', 'presupuestos.cancelar', 'pedidos.ver', 'pedidos.editar', 'pedidos.cancelar', 'pedidos.administrar', 'cobranzas.ver', 'cobranzas.crear', 'cobranzas.editar', 'cobranzas.aprobar', 'compras.ver', 'compras.crear', 'compras.editar', 'compras.aprobar', 'compras.cancelar', 'stock.ver', 'stock.editar', 'stock.administrar', 'productos.ver', 'productos.crear', 'productos.editar', 'clientes.ver', 'clientes.crear', 'clientes.editar', 'proveedores.ver', 'proveedores.crear', 'proveedores.editar', 'empleados.ver', 'empleados.crear', 'empleados.editar', 'empleados.administrar', 'reportes.ver', 'reportes.exportar']],
        'Admin'      => ['nombre' => 'Administrador', 'permisos' => array_map(fn($p) => $p[0] . '.' . $p[1], starlim_empleados_catalogo_permisos())],
    ];
}

function starlim_empleados_empresa_id(): int
{
    return function_exists('starlim_current_empresa_id') ? starlim_current_empresa_id(null, false) : 1;
}

function starlim_empleados_ensure_schema(PDO $pdo): void
{
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(30) NOT NULL DEFAULT ''");
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre VARCHAR(100) NOT NULL DEFAULT ''");
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apellido VARCHAR(100) NOT NULL DEFAULT ''");
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dni VARCHAR(30) NOT NULL DEFAULT ''");
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(100) NOT NULL DEFAULT ''");
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo SMALLINT NOT NULL DEFAULT 1");
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_ingreso DATE");
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS observaciones TEXT NOT NULL DEFAULT ''");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS app_roles (
            id SERIAL PRIMARY KEY,
            clave VARCHAR(50) NOT NULL UNIQUE,
            nombre VARCHAR(100) NOT NULL,
            descripcion TEXT NOT NULL DEFAULT '',
            activo SMALLINT NOT NULL DEFAULT 1
        )
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS app_permisos (
            id SERIAL PRIMARY KEY,
            clave VARCHAR(80) NOT NULL UNIQUE,
            modulo VARCHAR(50) NOT NULL,
            accion VARCHAR(50) NOT NULL,
            nombre VARCHAR(120) NOT NULL,
            descripcion TEXT NOT NULL DEFAULT ''
        )
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS app_rol_permisos (
            id_rol INT NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
            id_permiso INT NOT NULL REFERENCES app_permisos(id) ON DELETE CASCADE,
            PRIMARY KEY (id_rol, id_permiso)
        )
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS app_usuario_roles (
            id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            id_rol INT NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
            PRIMARY KEY (id_usuario, id_rol)
        )
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS app_usuario_permisos (
            id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            id_permiso INT NOT NULL REFERENCES app_permisos(id) ON DELETE CASCADE,
            PRIMARY KEY (id_usuario, id_permiso)
        )
    ");
    $pdo->exec("ALTER TABLE app_usuario_roles ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1");
    $pdo->exec("ALTER TABLE app_usuario_permisos ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_app_usuario_roles_empresa ON app_usuario_roles(empresa_id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_app_usuario_permisos_empresa ON app_usuario_permisos(empresa_id)");

    $catalogo = starlim_empleados_catalogo_permisos();
    $roles = starlim_empleados_roles_base();

    $permStmt = $pdo->prepare("
        INSERT INTO app_permisos (clave, modulo, accion, nombre)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (clave) DO UPDATE
        SET modulo = EXCLUDED.modulo,
            accion = EXCLUDED.accion,
            nombre = EXCLUDED.nombre
    ");
    foreach ($catalogo as [$modulo, $accion, $nombre]) {
        $permStmt->execute([$modulo . '.' . $accion, $modulo, $accion, $nombre]);
    }

    $roleStmt = $pdo->prepare("
        INSERT INTO app_roles (clave, nombre)
        VALUES (?, ?)
        ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre
    ");
    foreach ($roles as $clave => $data) {
        $roleStmt->execute([$clave, $data['nombre']]);
    }

    $pairs = [];
    foreach ($roles as $clave => $data) {
        foreach ($data['permisos'] as $permisoClave) {
            $pairs[] = [$clave, $permisoClave];
        }
    }
    if ($pairs) {
        foreach (array_chunk($pairs, 120) as $chunk) {
            $values = implode(',', array_fill(0, count($chunk), '(?, ?)'));
            $params = [];
            foreach ($chunk as [$roleClave, $permisoClave]) {
                $params[] = $roleClave;
                $params[] = $permisoClave;
            }
            $stmt = $pdo->prepare("
                INSERT INTO app_rol_permisos (id_rol, id_permiso)
                SELECT r.id, p.id
                FROM (VALUES $values) AS v(role_clave, permiso_clave)
                JOIN app_roles r ON r.clave = v.role_clave
                JOIN app_permisos p ON p.clave = v.permiso_clave
                ON CONFLICT DO NOTHING
            ");
            $stmt->execute($params);
        }
    }

    $pdo->exec("
        INSERT INTO app_usuario_roles (id_usuario, empresa_id, id_rol)
        SELECT u.id, COALESCE(ue.empresa_id, 1), r.id
        FROM usuarios u
        LEFT JOIN usuario_empresa ue ON ue.id_usuario = u.id AND ue.activo = TRUE
        JOIN app_roles r ON r.clave = u.rango
        WHERE u.rango NOT IN ('Minorista','Mayorista')
        ON CONFLICT DO NOTHING
    ");
}

function starlim_empleados_permisos(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT id, clave, modulo, accion, nombre
        FROM app_permisos
        ORDER BY modulo, accion
    ");
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function starlim_empleados_permisos_usuario(PDO $pdo): array
{
    $empresaId = starlim_empleados_empresa_id();
    $stmt = $pdo->prepare("SELECT id_usuario, id_permiso FROM app_usuario_permisos WHERE empresa_id = ? ORDER BY id_usuario, id_permiso");
    $stmt->execute([$empresaId]);
    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $uid = (int) $row['id_usuario'];
        $map[$uid] ??= [];
        $map[$uid][(int) $row['id_permiso']] = true;
    }
    return $map;
}

function starlim_empleados_guardar_permisos(PDO $pdo, int $idUsuario, array $idsPermisos): void
{
    $empresaId = starlim_empleados_empresa_id();
    $idsPermisos = array_values(array_unique(array_filter(array_map('intval', $idsPermisos))));
    $pdo->prepare("DELETE FROM app_usuario_permisos WHERE id_usuario = ? AND empresa_id = ?")->execute([$idUsuario, $empresaId]);
    if (!$idsPermisos) return;

    $stmt = $pdo->prepare("
        INSERT INTO app_usuario_permisos (id_usuario, empresa_id, id_permiso)
        VALUES (?, ?, ?)
        ON CONFLICT DO NOTHING
    ");
    foreach ($idsPermisos as $idPermiso) {
        $stmt->execute([$idUsuario, $empresaId, $idPermiso]);
    }
}

function starlim_empleados_sync_rol(PDO $pdo, int $idUsuario, string $rango): void
{
    $empresaId = starlim_empleados_empresa_id();
    $pdo->prepare("DELETE FROM app_usuario_roles WHERE id_usuario = ? AND empresa_id = ?")->execute([$idUsuario, $empresaId]);
    $stmt = $pdo->prepare("
        INSERT INTO app_usuario_roles (id_usuario, empresa_id, id_rol)
        SELECT ?, ?, id FROM app_roles WHERE clave = ?
        ON CONFLICT DO NOTHING
    ");
    $stmt->execute([$idUsuario, $empresaId, $rango]);
}
