<?php
session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: sign.php');
    die();
}

$cae         = htmlspecialchars($_GET['cae']         ?? '');
$vencimiento = htmlspecialchars($_GET['vencimiento'] ?? '');
$comprobante = htmlspecialchars($_GET['comprobante'] ?? '');
$total       = floatval($_GET['total']               ?? 0);
$tipo        = htmlspecialchars($_GET['tipo']        ?? '');
$cliente     = htmlspecialchars($_GET['cliente']     ?? '');
$id_venta    = intval($_GET['id_venta']              ?? 0);
$id_remito   = intval($_GET['id_remito']             ?? 0);
$nro_remito  = intval($_GET['nro_remito']            ?? 0);

if (!$cae) {
    header('Location: factura_manual.php');
    die();
}

$_mapa_tipo = [
    1 => ['label' => 'Factura A',         'corto' => 'Factura',         'prefijo' => 'FA' ],
    6 => ['label' => 'Factura B',         'corto' => 'Factura',         'prefijo' => 'FB' ],
    2 => ['label' => 'Nota de Débito A',  'corto' => 'Nota de Débito',  'prefijo' => 'NDA'],
    7 => ['label' => 'Nota de Débito B',  'corto' => 'Nota de Débito',  'prefijo' => 'NDB'],
    3 => ['label' => 'Nota de Crédito A', 'corto' => 'Nota de Crédito', 'prefijo' => 'NCA'],
    8 => ['label' => 'Nota de Crédito B', 'corto' => 'Nota de Crédito', 'prefijo' => 'NCB'],
];
// Compatibilidad hacia atrás: si $tipo llegase como 'A'/'B' (versión vieja)
$tipo_num = intval($tipo);
if (!isset($_mapa_tipo[$tipo_num])) {
    $tipo_num = ($tipo === 'A') ? 1 : 6;
}
$_info      = $_mapa_tipo[$tipo_num];
$tipo_label = $_info['label'];
$tipo_corto = $_info['corto'];
$total_fmt  = '$' . number_format($total, 2, ',', '.');

$url_factura      = '../php/generar_pdf_factura.php?id_venta='  . $id_venta;
$url_remito       = '../php/generar_pdf_remito.php?id_remito='  . $id_remito;
$url_factura_view = $url_factura . '&view=1';
$url_remito_view  = $url_remito  . '&view=1';

// Nombres de archivo y subcarpetas para descarga organizada
// Formato nombre: {PREFIJO}{NRO}-{Cliente}-{dd-mm-aa}.pdf
// Formato carpeta: {PREFIJO}_{mm-YYYY}
$mes_anio    = date('m-Y');                                       // 04-2026
$fecha_ddmmaa = date('d-m-y');                                    // 27-04-26
$nro_comp_pad = str_pad($comprobante, 8, '0', STR_PAD_LEFT);
$nro_rem_pad  = str_pad($nro_remito,  8, '0', STR_PAD_LEFT);

// Sanitizar nombre del cliente para usarlo en el nombre de archivo
$cliente_fn = preg_replace('/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ ]/', '', $cliente);
$cliente_fn = str_replace(' ', '_', trim($cliente_fn));
$cliente_fn = $cliente_fn ?: 'SinNombre';

$prefijo = $_info['prefijo'];

$nombre_factura     = $prefijo . '-' . $cliente_fn . '-' . $fecha_ddmmaa . '.pdf';
$subcarpeta_factura = $prefijo . '_' . $mes_anio;

$nombre_remito      = 'RMT-' . $cliente_fn . '-' . $fecha_ddmmaa . '.pdf';
$subcarpeta_remito  = 'RMT_' . $mes_anio;
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $tipo_corto; ?> emitida — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <style>
        body { overflow-x: hidden; }

        .cf-scene {
            display: flex;
            align-items: flex-start;
            justify-content: center;
            gap: 1rem;
            min-height: 100vh;
            padding: 6rem 1rem 3rem;
        }

        /* ── Card central ── */
        .cf-card {
            background-color: var(--card-color);
            border-radius: 16px;
            padding: 2rem 2.5rem;
            width: 480px;
            flex-shrink: 0;
            text-align: center;
        }

        .cf-icono   { font-size: 48px; margin-bottom: 1rem; }

        .cf-titulo  {
            font-size: 22px; font-weight: 700;
            color: var(--text-color); margin: 0 0 .25rem;
        }

        .cf-subtitulo {
            font-size: 14px; color: var(--text-color);
            opacity: .6; margin: 0 0 2rem;
        }

        .cf-datos {
            text-align: left;
            border-top: 1px solid rgba(0,0,0,.08);
            padding-top: 1.5rem;
            display: flex; flex-direction: column; gap: .75rem;
        }

        .cf-fila {
            display: flex; justify-content: space-between;
            font-size: 14px; color: var(--text-color);
        }

        .cf-fila span:first-child { opacity: .6; }

        .cf-fila span:last-child {
            font-weight: 600; word-break: break-all;
            text-align: right; max-width: 65%;
        }

        .cf-total {
            border-top: 1.5px solid rgba(0,0,0,.1);
            margin-top: .5rem; padding-top: .75rem; font-size: 17px;
        }

        /* ── Botones de la card ── */
        .cf-acciones {
            display: flex; gap: .75rem; margin-top: 2rem;
        }

        .cf-btn {
            flex: 1; padding: 12px; border-radius: 10px;
            font-size: 14px; font-weight: 600; font-family: inherit;
            cursor: pointer; border: none; transition: .2s;
            text-decoration: none; text-align: center; display: block;
        }

        .cf-btn-primary {
            background-color: #2563eb; color: #fff;
        }
        .cf-btn-primary:hover { background-color: #1d4ed8; }

        .cf-btn-secondary {
            background-color: transparent; color: var(--text-color);
            border: 1.5px solid rgba(0,0,0,.15);
        }
        .cf-btn-secondary:hover { opacity: .7; }

        /* ── Paneles laterales ── */
        .cf-panel {
            background-color: var(--card-color);
            border-radius: 16px;
            padding: 1.25rem 1rem;
            width: 185px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: .6rem;
            margin-top: 5.5rem; /* alinear visualmente con la card */
        }

        .cf-panel-btn {
            width: 100%; padding: 14px 10px;
            border-radius: 12px; font-size: 15px; font-weight: 600;
            font-family: inherit; cursor: pointer; border: none;
            transition: .2s; text-align: center;
            background-color: var(--card-color);
            color: var(--text-color);
            box-shadow: 0 0 0 1.5px rgba(0,0,0,.12);
        }
        .cf-panel-btn:hover { opacity: .7; }

        .cf-panel-btn-green {
            background-color: #22c55e; color: #fff;
            box-shadow: none;
        }
        .cf-panel-btn-green:hover { background-color: #16a34a; opacity: 1; }

        /* ── Dark mode ── */
        .dark-mode .cf-datos          { border-color: rgba(255,255,255,.1); }
        .dark-mode .cf-total          { border-color: rgba(255,255,255,.15); }
        .dark-mode .cf-btn-secondary  { border-color: rgba(255,255,255,.2); }
        .dark-mode .cf-panel-btn      { box-shadow: 0 0 0 1.5px rgba(255,255,255,.15); }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<div class="menu-sol">
    <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png">
</div>

<div class="cf-scene">

    <!-- Panel izquierdo: Remito -->
    <?php if ($id_remito): ?>
    <div class="cf-panel cf-panel-left" id="panel-remito">
        <button class="cf-panel-btn" onclick="imprimirDoc('<?php echo $url_remito_view; ?>')">Imprimir Remito</button>
        <button class="cf-panel-btn" onclick="descargar('<?php echo $url_remito; ?>','<?php echo $nombre_remito; ?>','<?php echo $subcarpeta_remito; ?>')">Descargar Remito</button>
        <button class="cf-panel-btn cf-panel-btn-green" onclick="compartirWhatsApp('<?php echo $url_remito_view; ?>','Remito','<?php echo $nombre_remito; ?>','<?php echo $subcarpeta_remito; ?>',<?php echo htmlspecialchars(json_encode($cliente)); ?>)">Compartir Remito</button>
    </div>
    <?php endif; ?>

    <!-- Card central -->
    <div class="cf-card">
        <div class="cf-icono"></div>
        <h1 class="cf-titulo"><?php echo $tipo_corto; ?> emitida con éxito</h1>
        <p class="cf-subtitulo"><?php echo $tipo_label; ?> — Comprobante N.° <?php echo str_pad($comprobante, 8, '0', STR_PAD_LEFT); ?></p>

        <div class="cf-datos">
            <div class="cf-fila">
                <span>Cliente</span>
                <span><?php echo $cliente ?: '—'; ?></span>
            </div>
            <div class="cf-fila">
                <span>CAE</span>
                <span><?php echo $cae; ?></span>
            </div>
            <div class="cf-fila">
                <span>Vencimiento CAE</span>
                <span><?php echo date('d/m/Y', strtotime($vencimiento)); ?></span>
            </div>
            <div class="cf-fila cf-total">
                <span>Total</span>
                <span><?php echo $total_fmt; ?></span>
            </div>
        </div>

        <div class="cf-acciones">
            <?php if ($id_remito): ?>
            <a href="<?php echo $url_remito_view; ?>" target="_blank" class="cf-btn cf-btn-primary">Ver<br>Remito</a>
            <?php endif; ?>
            <a href="factura_manual.php" class="cf-btn cf-btn-secondary">Nueva factura</a>
            <a href="<?php echo $url_factura_view; ?>" target="_blank" class="cf-btn cf-btn-primary">Ver<br><?php echo $tipo_corto; ?></a>
        </div>
    </div>

    <!-- Panel derecho: Factura -->
    <div class="cf-panel cf-panel-right" id="panel-factura">
        <button class="cf-panel-btn" onclick="imprimirDoc('<?php echo $url_factura_view; ?>')">Imprimir <?php echo $tipo_corto; ?></button>
        <button class="cf-panel-btn" onclick="descargar('<?php echo $url_factura; ?>','<?php echo $nombre_factura; ?>','<?php echo $subcarpeta_factura; ?>')">Descargar <?php echo $tipo_corto; ?></button>
        <button class="cf-panel-btn cf-panel-btn-green" onclick="compartirWhatsApp('<?php echo $url_factura_view; ?>','<?php echo $tipo_corto; ?>','<?php echo $nombre_factura; ?>','<?php echo $subcarpeta_factura; ?>',<?php echo htmlspecialchars(json_encode($cliente)); ?>)">Compartir <?php echo $tipo_corto; ?></button>
    </div>

</div>

<script src="../js/global.js"></script>
<script>
    // ── Helpers IndexedDB para persistir el handle de la carpeta base ──────
    function dbOpen() {
        return new Promise((res, rej) => {
            const r = indexedDB.open('starlim_fs', 1);
            r.onupgradeneeded = e => e.target.result.createObjectStore('handles');
            r.onsuccess = e => res(e.target.result);
            r.onerror   = () => rej();
        });
    }
    async function dbGetHandle() {
        try {
            const db  = await dbOpen();
            return await new Promise(res => {
                const req = db.transaction('handles','readonly').objectStore('handles').get('base');
                req.onsuccess = () => res(req.result ?? null);
                req.onerror   = () => res(null);
            });
        } catch { return null; }
    }
    async function dbSetHandle(handle) {
        try {
            const db = await dbOpen();
            await new Promise(res => {
                const tx = db.transaction('handles','readwrite');
                tx.objectStore('handles').put(handle, 'base');
                tx.oncomplete = res;
                tx.onerror    = res;
            });
        } catch {}
    }

    // ── Obtener (o pedir) la carpeta base de Star Lim ──────────────────────
    async function obtenerCarpetaBase() {
        if (!window.showDirectoryPicker) return null;

        let handle = await dbGetHandle();
        if (handle) {
            let perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') return handle;
        }

        // Primera vez o permiso revocado: mostrar selector de carpeta
        try {
            handle = await window.showDirectoryPicker({ id: 'starlim', mode: 'readwrite', startIn: 'downloads' });
            await dbSetHandle(handle);
            return handle;
        } catch (e) {
            if (e.name !== 'AbortError') console.error(e);
            return null;
        }
    }

    // ── Descargar con organización en carpetas ─────────────────────────────
    // Chrome/Edge: crea subcarpeta automáticamente y guarda el archivo ahí.
    // Otros navegadores: descarga normal con fecha incluida en el nombre.
    async function descargar(url, nombreArchivo, subcarpeta) {
        let blob;
        try {
            blob = await fetch(url).then(r => r.blob());
        } catch {
            alert('No se pudo obtener el documento.');
            return;
        }

        const carpetaBase = await obtenerCarpetaBase();
        if (carpetaBase) {
            try {
                const sub      = await carpetaBase.getDirectoryHandle(subcarpeta, { create: true });
                const fileH    = await sub.getFileHandle(nombreArchivo, { create: true });
                const writable = await fileH.createWritable();
                await writable.write(blob);
                await writable.close();
                return; // guardado en subcarpeta, listo
            } catch (e) {
                console.error('File System API falló, usando descarga normal:', e);
            }
        }

        // Fallback: descarga directa (el nombre ya incluye tipo y fecha)
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombreArchivo;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    // ── Imprimir ───────────────────────────────────────────────────────────
    function imprimirDoc(url) {
        window.open(url, '_blank');
    }

    // ── Compartir ──────────────────────────────────────────────────────────
    // telefono: número internacional sin '+' (ej: "5493513737820").
    // Cuando el módulo de clientes esté listo, pasar el teléfono del cliente aquí.
    async function compartirWhatsApp(url, nombre, nombreArchivo, subcarpeta, cliente, telefono = '') {
        let blob;
        try {
            blob = await fetch(url).then(r => r.blob());
        } catch {
            alert('No se pudo obtener el documento.');
            return;
        }

        const archivo  = new File([blob], nombreArchivo, { type: 'application/pdf' });
        const saludo   = cliente ? `¡Hola ${cliente}! ` : '¡Hola! ';
        const mensajeTxt = `${saludo}Te enviamos tu ${nombre} de Star Lim. Lo encontrás en el archivo adjunto.`;

        // Opción 1: Web Share API con archivo — abre el selector de apps del sistema.
        // WhatsApp envía el texto como mensaje separado y el PDF como adjunto.
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
            try {
                await navigator.share({ files: [archivo], title: nombre + ' — Star Lim', text: mensajeTxt });
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        // Opción 2 (fallback): descargar el archivo + abrir WhatsApp con mensaje
        await descargar(url, nombreArchivo, subcarpeta);
        const base = telefono ? 'https://wa.me/' + telefono : 'https://wa.me';
        window.open(base + '?text=' + encodeURIComponent(mensajeTxt), '_blank');
    }
</script>
</body>
</html>
