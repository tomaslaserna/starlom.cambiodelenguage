<?php
require_once __DIR__ . '/session_bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/tenant.php';
require_once __DIR__ . '/conexion_starlim_be.php';

starlim_session_start();

function starlim_registro_redirect(array $params, string $target = '../frontend/sign.php'): void {
    header('Location: ' . $target . '?' . http_build_query($params), true, 303);
    exit;
}

function starlim_registro_error(string $code): void {
    starlim_registro_redirect([
        'mode' => 'register',
        'registro_error' => $code,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    starlim_registro_error('invalid_request');
}

$nombre_completo = trim((string)($_POST['nombre_completo'] ?? ''));
$correo = trim((string)($_POST['correo'] ?? ''));
$usuario = trim((string)($_POST['usuario'] ?? ''));
$contrasena = (string)($_POST['contrasena'] ?? '');

if ($nombre_completo === '' || $correo === '' || $usuario === '' || $contrasena === '') {
    starlim_registro_error('missing_fields');
}

if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
    starlim_registro_error('invalid_email');
}

if (strlen($contrasena) < 6) {
    starlim_registro_error('weak_password');
}

// El registro publico siempre crea clientes. Los empleados se crean desde Gestion de empleados.
$rango = 'Minorista';

try {
    $pdo = $conexion->getPDO();

    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE lower(correo) = lower(?) LIMIT 1');
    $stmt->execute([$correo]);
    if ($stmt->fetch(PDO::FETCH_ASSOC)) {
        starlim_registro_error('email_exists');
    }

    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE lower(usuario) = lower(?) LIMIT 1');
    $stmt->execute([$usuario]);
    if ($stmt->fetch(PDO::FETCH_ASSOC)) {
        starlim_registro_error('user_exists');
    }

    $pass_encriptada = starlim_hash_password($contrasena);
    $empresa_id = starlim_current_empresa_id($conexion, false);

    $pdo->beginTransaction();

    $stmt = $pdo->prepare('
        INSERT INTO usuarios (nombre_completo, correo, usuario, contrasena, rango)
        VALUES (?, ?, ?, ?, ?)
        RETURNING id
    ');
    $stmt->execute([$nombre_completo, $correo, $usuario, $pass_encriptada, $rango]);
    $nuevo_id = (int)$stmt->fetchColumn();

    if ($nuevo_id <= 0) {
        throw new RuntimeException('No se pudo obtener el ID del usuario creado.');
    }

    $stmt = $pdo->prepare('
        INSERT INTO usuario_empresa (id_usuario, empresa_id, rango, activo)
        VALUES (?, ?, ?, TRUE)
        ON CONFLICT (id_usuario, empresa_id) DO UPDATE
        SET rango = EXCLUDED.rango,
            activo = TRUE,
            updated_at = CURRENT_TIMESTAMP
    ');
    $stmt->execute([$nuevo_id, $empresa_id, $rango]);

    $pdo->commit();

    session_regenerate_id(true);
    $_SESSION['id_usuario'] = $nuevo_id;
    $_SESSION['usuario'] = $usuario;
    $_SESSION['rango'] = $rango;
    $_SESSION['correo'] = $correo;

    starlim_bootstrap_tenant_context($conexion);
    header('Location: ../frontend/index.php?registered=1', true, 303);
    exit;
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[Starlim] Error en registro publico: ' . $e->getMessage());
    starlim_registro_error('save_failed');
}
