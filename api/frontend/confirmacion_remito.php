<?php
require_once __DIR__ . '/../php/session_bootstrap.php';
starlim_session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: sign.php');
    die();
}

$id_remito  = intval($_GET['id_remito']  ?? 0);
$nro_remito = intval($_GET['nro_remito'] ?? 0);
$total      = floatval($_GET['total']    ?? 0);
$cliente    = htmlspecialchars($_GET['cliente'] ?? '');

if (!$id_remito) {
    header('Location: factura_manual.php');
    die();
}

$total_fmt   = '$' . number_format($total, 2, ',', '.');
$nro_fmt     = str_pad($nro_remito, 8, '0', STR_PAD_LEFT);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Remito emitido — Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <style>
        .cf-wrap {
            max-width: 520px;
            margin: 6rem auto 3rem;
            padding: 0 1.5rem;
        }

        .cf-card {
            background-color: var(--card-color);
            border-radius: 16px;
            padding: 2rem 2.5rem;
            text-align: center;
        }

        .cf-icono { font-size: 48px; margin-bottom: 1rem; }

        .cf-titulo {
            font-size: 22px;
            font-weight: 700;
            color: var(--text-color);
            margin: 0 0 .25rem;
        }

        .cf-subtitulo {
            font-size: 14px;
            color: var(--text-color);
            opacity: .6;
            margin: 0 0 2rem;
        }

        .cf-datos {
            text-align: left;
            border-top: 1px solid rgba(0,0,0,.08);
            padding-top: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: .75rem;
        }

        .cf-fila {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: var(--text-color);
        }

        .cf-fila span:first-child { opacity: .6; }

        .cf-fila span:last-child {
            font-weight: 600;
            word-break: break-all;
            text-align: right;
            max-width: 65%;
        }

        .cf-total {
            border-top: 1.5px solid rgba(0,0,0,.1);
            margin-top: .5rem;
            padding-top: .75rem;
            font-size: 17px;
        }

        .cf-acciones {
            display: flex;
            gap: .75rem;
            margin-top: 2rem;
        }

        .cf-btn {
            flex: 1;
            padding: 12px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            border: none;
            transition: .2s;
            text-decoration: none;
            text-align: center;
        }

        .cf-btn-primary {
            background-color: #2563eb;
            color: #fff;
        }

        .cf-btn-primary:hover { background-color: #1d4ed8; }

        .cf-btn-secondary {
            background-color: transparent;
            color: var(--text-color);
            border: 1.5px solid rgba(0,0,0,.15);
        }

        .cf-btn-secondary:hover { opacity: .7; }

        .dark-mode .cf-datos         { border-color: rgba(255,255,255,.1); }
        .dark-mode .cf-total         { border-color: rgba(255,255,255,.15); }
        .dark-mode .cf-btn-secondary { border-color: rgba(255,255,255,.2); }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<div class="menu-sol">
    <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png">
</div>

<div class="cf-wrap">
    <div class="cf-card">
        <div class="cf-icono"></div>
        <h1 class="cf-titulo">Remito emitido con éxito</h1>
        <p class="cf-subtitulo">Remito N.° <?php echo $nro_fmt; ?></p>

        <div class="cf-datos">
            <div class="cf-fila">
                <span>Cliente</span>
                <span><?php echo $cliente ?: '—'; ?></span>
            </div>
            <div class="cf-fila">
                <span>Nro. remito</span>
                <span><?php echo $nro_fmt; ?></span>
            </div>
            <div class="cf-fila cf-total">
                <span>Total</span>
                <span><?php echo $total_fmt; ?></span>
            </div>
        </div>

        <div class="cf-acciones">
            <a href="factura_manual.php" class="cf-btn cf-btn-secondary">Nuevo comprobante</a>
            <a href="../php/generar_pdf_remito.php?id_remito=<?php echo $id_remito; ?>"
               class="cf-btn cf-btn-primary" target="_blank">Descargar remito</a>
        </div>
    </div>
</div>

<script src="../js/global.js"></script>
</body>
</html>
