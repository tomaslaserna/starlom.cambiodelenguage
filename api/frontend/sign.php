<?php
require_once __DIR__ . '/../php/security_headers.php';
starlim_apply_security_headers(false);
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Acceso | Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/theme.css">
    <link rel="stylesheet" href="../css/styleSign.css?v=20260618-login-enterprise-2">
</head>

<body class="auth-page">
    <?php
        $authNotice = '';
        $authNoticeType = 'warning';
        $authMode = ($_GET['mode'] ?? '') === 'register' ? 'register' : 'login';

        if (isset($_GET['expired'])) {
            $authNotice = 'Tu sesi&oacute;n venci&oacute;. Inici&aacute; sesi&oacute;n para continuar.';
        } elseif (isset($_GET['no_access'])) {
            $authNotice = 'No ten&eacute;s acceso a esa secci&oacute;n con este usuario.';
        } elseif (isset($_GET['registered'])) {
            $authNotice = 'Cuenta creada correctamente. Inici&aacute; sesi&oacute;n para continuar.';
            $authNoticeType = 'success';
        } elseif (isset($_GET['registro_error'])) {
            $authMode = 'register';
            $authNoticeType = 'error';
            $registroError = (string)$_GET['registro_error'];
            $authNotice = [
                'invalid_request' => 'La solicitud de registro no es v&aacute;lida. Intent&aacute; de nuevo.',
                'missing_fields' => 'Complet&aacute; todos los campos para crear la cuenta.',
                'invalid_email' => 'Ingres&aacute; un correo electr&oacute;nico v&aacute;lido.',
                'weak_password' => 'La contrase&ntilde;a debe tener al menos 6 caracteres.',
                'email_exists' => 'Ese correo ya est&aacute; registrado. Inici&aacute; sesi&oacute;n o us&aacute; otro correo.',
                'user_exists' => 'Ese usuario ya existe. Eleg&iacute; otro nombre de usuario.',
                'save_failed' => 'No pudimos crear la cuenta. Revis&aacute; los datos e intent&aacute; de nuevo.',
            ][$registroError] ?? 'No pudimos completar el registro. Intent&aacute; de nuevo.';
        }
    ?>

    <main class="auth-layout">
        <section class="auth-brand-panel" aria-label="Starlim sistema operativo">
            <div class="auth-brand-top">
                <a class="auth-brand" href="index.php" aria-label="Volver al inicio de Starlim">
                    <span class="auth-brand-mark" aria-hidden="true"></span>
                    <span>Starlim</span>
                </a>
                <a class="auth-home-link" href="index.php">Inicio</a>
            </div>

            <div class="auth-brand-content">
                <span class="auth-eyebrow">Sistema operativo</span>
                <h1>Toda tu operaci&oacute;n, en un solo lugar.</h1>
                <p>Gestion&aacute; ventas, stock, pedidos, compras y cobranzas desde una plataforma centralizada.</p>

                <div class="auth-pills" aria-label="Areas principales">
                    <span>Ventas</span>
                    <span>Stock</span>
                    <span>Clientes</span>
                </div>
            </div>

            <div class="auth-dashboard-preview" aria-hidden="true">
                <div class="auth-preview-card auth-preview-card--wide">
                    <span></span>
                    <strong></strong>
                </div>
                <div class="auth-preview-grid">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </section>

        <section class="auth-form-panel" aria-label="Inicio de sesion">
            <button type="button" class="auth-theme" id="dark-mode-toggle" aria-label="Cambiar tema">
                <img class="luyso" src="../imagenesIndex/luna.png" alt="">
            </button>

            <div class="auth-stack">
                <?php if ($authNotice !== ''): ?>
                    <div class="auth-notice auth-notice--<?= htmlspecialchars($authNoticeType, ENT_QUOTES, 'UTF-8') ?>" role="alert" aria-live="polite">
                        <span class="auth-notice-icon" aria-hidden="true">i</span>
                        <span><?= htmlspecialchars_decode($authNotice, ENT_QUOTES) ?></span>
                    </div>
                <?php endif; ?>

                <div class="auth-card" data-mode="<?= htmlspecialchars($authMode, ENT_QUOTES, 'UTF-8') ?>">
                    <form action="../php/login_usuario_be.php" method="POST" class="auth-form formulario__login" <?= $authMode === 'register' ? 'hidden' : '' ?> novalidate>
                        <div class="auth-card-head">
                            <span class="form-kicker"><span aria-hidden="true"></span>Acceso seguro</span>
                            <h2>Iniciar sesi&oacute;n</h2>
                            <p>Ingres&aacute; tus credenciales para acceder al panel.</p>
                        </div>

                        <div class="auth-field">
                            <label for="login-correo">Usuario o correo</label>
                            <input id="login-correo" type="text" name="correo" autocomplete="username" required>
                            <small>Ingres&aacute; tu usuario o correo registrado.</small>
                        </div>

                        <div class="auth-field">
                            <label for="login-contrasena">Contrase&ntilde;a</label>
                            <div class="auth-password">
                                <input id="login-contrasena" type="password" name="contrasena" autocomplete="current-password" required>
                                <button type="button" class="auth-password-toggle" data-toggle-password="login-contrasena" aria-label="Mostrar contrasena" aria-pressed="false">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                            </div>
                            <small>La contrase&ntilde;a es obligatoria.</small>
                        </div>

                        <button type="submit" class="auth-submit" data-loading-text="Ingresando...">Entrar al panel</button>

                        <p class="auth-switch">
                            &iquest;No ten&eacute;s una cuenta?
                            <button type="button" data-auth-switch="register">Registrate</button>
                        </p>
                    </form>

                    <form action="../php/registro_usuario_be.php" method="POST" class="auth-form formulario__register" <?= $authMode === 'register' ? '' : 'hidden' ?> novalidate>
                        <div class="auth-card-head">
                            <span class="form-kicker"><span aria-hidden="true"></span>Alta de usuario</span>
                            <h2>Registrarse</h2>
                            <p>Cre&aacute; una cuenta para solicitar acceso al sistema.</p>
                        </div>

                        <div class="auth-field">
                            <label for="register-nombre">Nombre completo</label>
                            <input id="register-nombre" type="text" name="nombre_completo" autocomplete="name" required>
                            <small>Us&aacute; nombre y apellido reales.</small>
                        </div>

                        <div class="auth-field">
                            <label for="register-correo">Correo electr&oacute;nico</label>
                            <input id="register-correo" type="email" name="correo" autocomplete="email" required>
                            <small>Ingres&aacute; un correo v&aacute;lido.</small>
                        </div>

                        <div class="auth-field">
                            <label for="register-usuario">Usuario</label>
                            <input id="register-usuario" type="text" name="usuario" autocomplete="username" required>
                            <small>Este usuario se usar&aacute; para iniciar sesi&oacute;n.</small>
                        </div>

                        <div class="auth-field">
                            <label for="register-contrasena">Contrase&ntilde;a</label>
                            <div class="auth-password">
                                <input id="register-contrasena" type="password" name="contrasena" autocomplete="new-password" required>
                                <button type="button" class="auth-password-toggle" data-toggle-password="register-contrasena" aria-label="Mostrar contrasena" aria-pressed="false">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                            </div>
                            <small>Defin&iacute; una contrase&ntilde;a para el acceso.</small>
                        </div>

                        <button type="submit" class="auth-submit" data-loading-text="Creando cuenta...">Crear cuenta</button>

                        <p class="auth-switch">
                            &iquest;Ya ten&eacute;s cuenta?
                            <button type="button" data-auth-switch="login">Inici&aacute; sesi&oacute;n</button>
                        </p>
                    </form>
                </div>
            </div>
        </section>
    </main>

    <script src="../js/scriptSign.js"></script>
    <script src="../js/global.js"></script>
</body>
</html>
