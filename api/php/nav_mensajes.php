<?php
/**
 * nav_mensajes.php — Centro de mensajería del nav (campanita junto al usuario).
 * Bandeja de recibidos + redactar, todo desde el dropdown. Reemplaza a la
 * vieja pestaña de mensajes que vivía en Base de Datos.
 * Requiere: $conexion (mysqli) y $usuario (string) definidos antes de incluir.
 */
$_nmsg_list  = [];
$_nmsg_count = 0;
$_nmsg_empleados = [];

if (!empty($conexion) && !empty($usuario)) {
    require_once __DIR__ . '/mensajes_lib.php';
    starlim_mensajes_ensure_schema($conexion);
    $empresaIdMensajes = function_exists('starlim_current_empresa_id') ? starlim_current_empresa_id($conexion, false) : 1;
    // En la carga inicial solo traemos el contador. El listado completo y la
    // lista de empleados se cargan al abrir el dropdown para no frenar cada página.
    $nstmt = $conexion->prepare(
        "SELECT COUNT(*) AS c FROM mensajes WHERE empresa_id = ? AND para = ? AND leido = 0"
    );
    if ($nstmt) {
        $nstmt->bind_param('is', $empresaIdMensajes, $usuario);
        $nstmt->execute();
        $nres = $nstmt->get_result();
        $nrow = $nres->fetch_assoc();
        $_nmsg_count = (int)($nrow['c'] ?? 0);
        $nstmt->close();
    }
}
?>
<style>
.nav-msgs-dropdown { width:340px; }
.nm-tabs { display:flex; border-bottom:1px solid rgba(128,128,128,.18); }
.nm-tab { flex:1; padding:9px 0; background:none; border:none; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:inherit; opacity:.6; }
.nm-tab.active { opacity:1; border-bottom:2px solid #2563eb; color:#2563eb; }
.nm-pane { display:none; } .nm-pane.active { display:block; }
.nm-compose { padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
.nm-compose input, .nm-compose textarea { width:100%; box-sizing:border-box; padding:7px 9px; border:1.5px solid #d1d5db; border-radius:7px; font-size:13px; font-family:inherit; background:#fff; color:#101828; }
.dark-mode .nm-compose input, .dark-mode .nm-compose textarea { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
.nm-send { align-self:flex-end; padding:7px 16px; background:#2563eb; color:#fff; border:none; border-radius:7px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit; }
.nm-send:hover { background:#1d4ed8; }
.nm-feedback { font-size:12px; min-height:15px; }
.nm-feedback.ok { color:#16a34a; } .nm-feedback.err { color:#dc2626; }
.nav-msg-item--read { opacity:.62; }
</style>
<div class="nav-msgs-wrap" id="nav-msgs-wrap">
    <button class="nav-msgs-btn" id="nav-msgs-btn" type="button" aria-label="Mensajes">
        <svg class="nav-msgs-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
        </svg>
        <?php if ($_nmsg_count > 0): ?><span class="nav-msgs-badge" id="nav-msgs-badge"><?= $_nmsg_count ?></span><?php endif; ?>
    </button>

    <div class="nav-msgs-dropdown" id="nav-msgs-dropdown">
        <div class="nm-tabs">
            <button class="nm-tab active" data-pane="recibidos">Mensajes</button>
            <button class="nm-tab" data-pane="redactar">Redactar</button>
        </div>

        <div class="nm-pane active" id="nm-pane-recibidos">
            <div class="nav-msgs-list" id="nm-msgs-list">
                <p class="nav-msgs-empty">Abrir mensajes para cargar la bandeja.</p>
            </div>
        </div>

        <div class="nm-pane" id="nm-pane-redactar">
            <form class="nm-compose" id="nm-compose-form">
                <input type="text" id="nm-para" name="para" list="nm-empleados" placeholder="Para (usuario)" autocomplete="off" required>
                <datalist id="nm-empleados"></datalist>
                <input type="text" id="nm-asunto" name="asunto" placeholder="Asunto" maxlength="255" required>
                <textarea id="nm-cuerpo" name="cuerpo" rows="3" placeholder="Mensaje..." required></textarea>
                <span class="nm-feedback" id="nm-feedback"></span>
                <button type="submit" class="nm-send" id="nm-send">Enviar</button>
            </form>
        </div>
    </div>
</div>
<script>
(function () {
    var btn  = document.getElementById('nav-msgs-btn');
    var wrap = document.getElementById('nav-msgs-wrap');
    if (!btn || !wrap) return;
    var marcado = false;
    var cargado = false;

    function setText(el, text) {
        el.textContent = text == null ? '' : String(text);
        return el;
    }

    function renderMensajes(mensajes) {
        var list = document.getElementById('nm-msgs-list');
        if (!list) return;
        list.innerHTML = '';
        if (!mensajes || !mensajes.length) {
            var empty = document.createElement('p');
            empty.className = 'nav-msgs-empty';
            empty.textContent = 'Sin mensajes';
            list.appendChild(empty);
            return;
        }
        mensajes.forEach(function (m) {
            var item = document.createElement('div');
            item.className = 'nav-msg-item' + (Number(m.leido) ? ' nav-msg-item--read' : '');

            var top = document.createElement('div');
            top.className = 'nav-msg-top';
            top.appendChild(setText(document.createElement('span'), m.de));
            top.lastChild.className = 'nav-msg-from';
            top.appendChild(setText(document.createElement('span'), m.fecha_fmt));
            top.lastChild.className = 'nav-msg-date';

            var subject = setText(document.createElement('div'), m.asunto);
            subject.className = 'nav-msg-subject';

            var preview = setText(document.createElement('div'), m.cuerpo_preview);
            preview.className = 'nav-msg-preview';

            item.appendChild(top);
            item.appendChild(subject);
            item.appendChild(preview);
            list.appendChild(item);
        });
    }

    function renderEmpleados(empleados) {
        var datalist = document.getElementById('nm-empleados');
        if (!datalist) return;
        datalist.innerHTML = '';
        (empleados || []).forEach(function (e) {
            var opt = document.createElement('option');
            opt.value = e;
            datalist.appendChild(opt);
        });
    }

    function cargarMensajes() {
        if (cargado) return Promise.resolve();
        var list = document.getElementById('nm-msgs-list');
        if (list) list.innerHTML = '<p class="nav-msgs-empty">Cargando...</p>';
        return fetch('../php/nav_mensajes_data.php', { credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d.ok) throw new Error(d.error || 'Error');
                cargado = true;
                renderMensajes(d.mensajes || []);
                renderEmpleados(d.empleados || []);
            })
            .catch(function () {
                if (list) list.innerHTML = '<p class="nav-msgs-empty">No se pudieron cargar los mensajes.</p>';
            });
    }

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var abierto = wrap.classList.toggle('open');
        if (abierto) cargarMensajes();
        if (abierto && !marcado) {
            marcado = true;
            fetch('../php/marcar_mensajes_leidos.php', { method: 'POST', credentials: 'same-origin', cache: 'no-store' }).then(function () {
                var b = document.getElementById('nav-msgs-badge');
                if (b) b.remove();
            }).catch(function () {});
        }
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') wrap.classList.remove('open'); });

    // Tabs
    wrap.querySelectorAll('.nm-tab').forEach(function (t) {
        t.addEventListener('click', function (e) {
            e.stopPropagation();
            wrap.querySelectorAll('.nm-tab').forEach(function (x) { x.classList.remove('active'); });
            wrap.querySelectorAll('.nm-pane').forEach(function (x) { x.classList.remove('active'); });
            t.classList.add('active');
            document.getElementById('nm-pane-' + t.dataset.pane).classList.add('active');
        });
    });

    // Redactar
    var form = document.getElementById('nm-compose-form');
    if (form) {
        form.addEventListener('click', function (e) { e.stopPropagation(); });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var fb = document.getElementById('nm-feedback');
            var send = document.getElementById('nm-send');
            send.disabled = true; fb.textContent = 'Enviando...'; fb.className = 'nm-feedback';
            fetch('../php/enviar_mensaje.php', { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: new FormData(form) })
                .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(function (d) {
                    if (d.ok) { fb.textContent = 'Mensaje enviado.'; fb.className = 'nm-feedback ok'; form.reset(); }
                    else { fb.textContent = d.error || 'Error al enviar.'; fb.className = 'nm-feedback err'; }
                })
                .catch(function () { fb.textContent = 'Error de conexión.'; fb.className = 'nm-feedback err'; })
                .finally(function () { send.disabled = false; setTimeout(function () { fb.textContent = ''; }, 4000); });
        });
    }
})();
</script>
