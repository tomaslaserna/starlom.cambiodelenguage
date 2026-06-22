<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.conciliacion_bancaria');
date_default_timezone_set('America/Argentina/Buenos_Aires');
$canEdit = ar_can_edit($conexion, 'admin.conciliacion_bancaria');
$csrf = ar_csrf_token();
$notice = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $canEdit) {
    ar_check_csrf();
    $action = (string)($_POST['action'] ?? '');

    try {
        if ($action === 'account') {
            $nombre = trim((string)($_POST['nombre'] ?? ''));
            if ($nombre === '') throw new RuntimeException('La cuenta necesita un nombre.');
            $stmt = $pdo->prepare("
                INSERT INTO admin_bank_accounts
                    (empresa_id, nombre, banco, moneda, tipo_cuenta, alias_cuenta, cbu_masked)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $empresaId,
                $nombre,
                trim((string)($_POST['banco'] ?? '')),
                strtoupper(trim((string)($_POST['moneda'] ?? 'ARS'))) ?: 'ARS',
                trim((string)($_POST['tipo_cuenta'] ?? '')),
                trim((string)($_POST['alias_cuenta'] ?? '')),
                trim((string)($_POST['cbu_masked'] ?? '')),
            ]);
            starlim_admin_audit($conexion, 'admin.conciliacion_bancaria', 'crear_cuenta_bancaria', 'bank_account', '', ['nombre' => $nombre]);
            $notice = 'Cuenta bancaria creada.';
        }

        if ($action === 'statement_line') {
            $accountId = ctype_digit((string)($_POST['bank_account_id'] ?? '')) ? (int)$_POST['bank_account_id'] : 0;
            $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_POST['fecha'] ?? '')) ? (string)$_POST['fecha'] : '';
            $tipo = in_array((string)($_POST['tipo'] ?? ''), ['credit', 'debit'], true) ? (string)$_POST['tipo'] : '';
            $monto = ar_decimal_input('monto');
            if ($accountId <= 0 || $fecha === '' || $tipo === '' || $monto === '0') {
                throw new RuntimeException('Completa cuenta, fecha, tipo y monto.');
            }
            $debit = $tipo === 'debit' ? $monto : '0';
            $credit = $tipo === 'credit' ? $monto : '0';
            $amountExpr = $tipo === 'credit' ? $monto : '-' . ltrim($monto, '+');
            $stmt = $pdo->prepare("
                INSERT INTO admin_bank_statement_lines
                    (empresa_id, bank_account_id, fecha, descripcion, referencia, debit, credit, amount, notas, imported_by)
                SELECT ?, ?, ?, ?, ?, CAST(? AS numeric), CAST(? AS numeric), CAST(? AS numeric), ?, ?
                WHERE EXISTS (
                    SELECT 1 FROM admin_bank_accounts WHERE id = ? AND empresa_id = ? AND activo = TRUE
                )
            ");
            $stmt->execute([
                $empresaId,
                $accountId,
                $fecha,
                trim((string)($_POST['descripcion'] ?? '')),
                trim((string)($_POST['referencia'] ?? '')),
                $debit,
                $credit,
                $amountExpr,
                trim((string)($_POST['notas'] ?? '')),
                (string)($_SESSION['usuario'] ?? ''),
                $accountId,
                $empresaId,
            ]);
            if ($stmt->rowCount() !== 1) throw new RuntimeException('La cuenta bancaria no existe o no esta activa.');
            starlim_admin_audit($conexion, 'admin.conciliacion_bancaria', 'cargar_extracto', 'bank_statement_line', '', ['cuenta' => $accountId, 'monto' => $monto, 'tipo' => $tipo]);
            $notice = 'Movimiento bancario cargado.';
        }

        if ($action === 'match') {
            $lineId = ctype_digit((string)($_POST['statement_line_id'] ?? '')) ? (int)$_POST['statement_line_id'] : 0;
            $pagoId = ctype_digit((string)($_POST['pago_registro_id'] ?? '')) ? (int)$_POST['pago_registro_id'] : 0;
            $monto = ar_decimal_input('matched_amount');
            if ($lineId <= 0 || $pagoId <= 0 || $monto === '0') throw new RuntimeException('Selecciona extracto, movimiento y monto.');

            $pdo->beginTransaction();
            $stmt = $pdo->prepare("
                WITH line_data AS (
                    SELECT l.id, ABS(l.amount) AS line_abs, l.status,
                           COALESCE(SUM(CASE WHEN m.status = 'confirmed' THEN m.matched_amount ELSE 0 END),0) AS already_matched
                    FROM admin_bank_statement_lines l
                    LEFT JOIN admin_bank_reconciliation_matches m ON m.statement_line_id = l.id
                    WHERE l.id = :line_id
                      AND l.empresa_id = :empresa_line
                      AND l.status <> 'ignored'
                    GROUP BY l.id, l.amount, l.status
                ),
                payment_data AS (
                    SELECT p.id, p.monto,
                           COALESCE(SUM(CASE WHEN m.status = 'confirmed' THEN m.matched_amount ELSE 0 END),0) AS already_matched
                    FROM pagos_registro p
                    LEFT JOIN admin_bank_reconciliation_matches m ON m.pago_registro_id = p.id
                    WHERE p.id = :pago_id
                      AND p.empresa_id = :empresa_pago
                    GROUP BY p.id, p.monto
                ),
                allowed AS (
                    SELECT LEAST(line_data.line_abs - line_data.already_matched, payment_data.monto - payment_data.already_matched) AS remaining
                    FROM line_data, payment_data
                )
                INSERT INTO admin_bank_reconciliation_matches
                    (empresa_id, statement_line_id, pago_registro_id, matched_amount, notas, created_by)
                SELECT :empresa_insert, :line_insert, :pago_insert, CAST(:monto AS numeric), :notas, :usuario
                FROM allowed
                WHERE CAST(:monto_check AS numeric) > 0
                  AND CAST(:monto_limit AS numeric) <= remaining
                ON CONFLICT (statement_line_id, pago_registro_id) DO NOTHING
            ");
            $stmt->execute([
                'line_id' => $lineId,
                'empresa_line' => $empresaId,
                'pago_id' => $pagoId,
                'empresa_pago' => $empresaId,
                'empresa_insert' => $empresaId,
                'line_insert' => $lineId,
                'pago_insert' => $pagoId,
                'monto' => $monto,
                'notas' => trim((string)($_POST['notas'] ?? '')),
                'usuario' => (string)($_SESSION['usuario'] ?? ''),
                'monto_check' => $monto,
                'monto_limit' => $monto,
            ]);
            if ($stmt->rowCount() !== 1) {
                $pdo->rollBack();
                throw new RuntimeException('No se pudo conciliar: monto excedido, duplicado o datos incompatibles.');
            }
            $update = $pdo->prepare("
                WITH totals AS (
                    SELECT l.id,
                           ABS(l.amount) AS line_abs,
                           COALESCE(SUM(CASE WHEN m.status = 'confirmed' THEN m.matched_amount ELSE 0 END),0) AS matched
                    FROM admin_bank_statement_lines l
                    LEFT JOIN admin_bank_reconciliation_matches m ON m.statement_line_id = l.id
                    WHERE l.id = ? AND l.empresa_id = ?
                    GROUP BY l.id, l.amount
                )
                UPDATE admin_bank_statement_lines l
                SET status = CASE WHEN totals.matched >= totals.line_abs THEN 'matched' ELSE 'partial' END,
                    updated_at = CURRENT_TIMESTAMP
                FROM totals
                WHERE l.id = totals.id
            ");
            $update->execute([$lineId, $empresaId]);
            $pdo->commit();
            starlim_admin_audit($conexion, 'admin.conciliacion_bancaria', 'conciliar_movimiento', 'bank_statement_line', $lineId, ['pago_registro_id' => $pagoId, 'monto' => $monto]);
            $notice = 'Movimiento conciliado.';
        }

        if ($action === 'ignore_line') {
            $lineId = ctype_digit((string)($_POST['statement_line_id'] ?? '')) ? (int)$_POST['statement_line_id'] : 0;
            if ($lineId <= 0) throw new RuntimeException('Movimiento invalido.');
            $stmt = $pdo->prepare("
                UPDATE admin_bank_statement_lines
                SET status = 'ignored', notas = CONCAT(notas, CASE WHEN notas = '' THEN '' ELSE E'\n' END, ?), updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND empresa_id = ? AND status IN ('pending','partial')
            ");
            $stmt->execute([trim((string)($_POST['notas'] ?? 'Ignorado manualmente')), $lineId, $empresaId]);
            starlim_admin_audit($conexion, 'admin.conciliacion_bancaria', 'ignorar_extracto', 'bank_statement_line', $lineId, []);
            $notice = 'Movimiento marcado como ignorado.';
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $error = $e->getMessage();
    }
}

$desde = ar_date_param('desde', date('Y-m-01'));
$hasta = ar_date_param('hasta', date('Y-m-d'));
$hastaExclusive = date('Y-m-d', strtotime($hasta . ' +1 day'));
$accountFilter = ctype_digit((string)($_GET['cuenta'] ?? '')) ? (int)$_GET['cuenta'] : 0;
$statusFilter = in_array((string)($_GET['estado'] ?? ''), ['pending', 'partial', 'matched', 'ignored'], true) ? (string)$_GET['estado'] : '';

$accounts = ar_query_all($pdo, "
    SELECT id, nombre, banco, moneda, tipo_cuenta, alias_cuenta, cbu_masked
    FROM admin_bank_accounts
    WHERE empresa_id = :empresa AND activo = TRUE
    ORDER BY nombre
", ['empresa' => $empresaId]);

$lineWhere = ["l.empresa_id = :empresa_l", "l.fecha >= :desde_l", "l.fecha < :hasta_l"];
$lineParams = ['empresa_l' => $empresaId, 'desde_l' => $desde, 'hasta_l' => $hastaExclusive];
if ($accountFilter > 0) { $lineWhere[] = "l.bank_account_id = :account_l"; $lineParams['account_l'] = $accountFilter; }
if ($statusFilter !== '') { $lineWhere[] = "l.status = :status_l"; $lineParams['status_l'] = $statusFilter; }

$summary = ar_query_one($pdo, "
    WITH bank AS (
        SELECT COALESCE(SUM(credit),0) creditos,
               COALESCE(SUM(debit),0) debitos,
               COALESCE(SUM(amount),0) neto,
               COUNT(*) total_lineas,
               SUM(CASE WHEN status IN ('pending','partial') THEN 1 ELSE 0 END) pendientes
        FROM admin_bank_statement_lines l
        WHERE " . implode(' AND ', $lineWhere) . "
    ),
    matched AS (
        SELECT COALESCE(SUM(m.matched_amount),0) total
        FROM admin_bank_reconciliation_matches m
        JOIN admin_bank_statement_lines l ON l.id = m.statement_line_id
        WHERE " . implode(' AND ', $lineWhere) . "
          AND m.status = 'confirmed'
    ),
    system AS (
        SELECT COALESCE(SUM(CASE WHEN tipo = 'cobro' THEN monto ELSE 0 END),0) cobros,
               COALESCE(SUM(CASE WHEN tipo = 'pago' THEN monto ELSE 0 END),0) pagos
        FROM pagos_registro
        WHERE empresa_id = :empresa_s
          AND fecha >= :desde_s
          AND fecha < :hasta_s
    )
    SELECT ROUND((SELECT creditos FROM bank),2)::text AS creditos_banco,
           ROUND((SELECT debitos FROM bank),2)::text AS debitos_banco,
           ROUND((SELECT neto FROM bank),2)::text AS neto_banco,
           (SELECT total_lineas FROM bank)::text AS lineas_banco,
           COALESCE((SELECT pendientes FROM bank),0)::text AS lineas_pendientes,
           ROUND((SELECT total FROM matched),2)::text AS conciliado,
           ROUND((SELECT cobros FROM system),2)::text AS cobros_sistema,
           ROUND((SELECT pagos FROM system),2)::text AS pagos_sistema
", $lineParams + ['empresa_s' => $empresaId, 'desde_s' => $desde, 'hasta_s' => $hastaExclusive]) + [
    'creditos_banco' => '0', 'debitos_banco' => '0', 'neto_banco' => '0', 'lineas_banco' => '0', 'lineas_pendientes' => '0', 'conciliado' => '0', 'cobros_sistema' => '0', 'pagos_sistema' => '0'
];

$lines = ar_query_all($pdo, "
    SELECT l.id, l.fecha::text, l.descripcion, l.referencia, l.debit::text, l.credit::text, l.amount::text, l.status,
           a.nombre AS cuenta,
           ROUND(ABS(l.amount) - COALESCE(SUM(CASE WHEN m.status = 'confirmed' THEN m.matched_amount ELSE 0 END),0),2)::text AS pendiente
    FROM admin_bank_statement_lines l
    JOIN admin_bank_accounts a ON a.id = l.bank_account_id
    LEFT JOIN admin_bank_reconciliation_matches m ON m.statement_line_id = l.id
    WHERE " . implode(' AND ', $lineWhere) . "
    GROUP BY l.id, l.fecha, l.descripcion, l.referencia, l.debit, l.credit, l.amount, l.status, a.nombre
    ORDER BY l.fecha DESC, l.id DESC
    LIMIT 120
", $lineParams);

$systemMovements = ar_query_all($pdo, "
    SELECT p.id, p.tipo, p.entidad_nombre, p.concepto, p.fecha::text,
           ROUND(p.monto,2)::text AS monto,
           ROUND(p.monto - COALESCE(SUM(CASE WHEN m.status = 'confirmed' THEN m.matched_amount ELSE 0 END),0),2)::text AS pendiente
    FROM pagos_registro p
    LEFT JOIN admin_bank_reconciliation_matches m ON m.pago_registro_id = p.id
    WHERE p.empresa_id = :empresa
      AND p.fecha >= :desde
      AND p.fecha < :hasta
    GROUP BY p.id, p.tipo, p.entidad_nombre, p.concepto, p.fecha, p.monto
    HAVING p.monto - COALESCE(SUM(CASE WHEN m.status = 'confirmed' THEN m.matched_amount ELSE 0 END),0) > 0
    ORDER BY p.fecha DESC, p.id DESC
    LIMIT 120
", ['empresa' => $empresaId, 'desde' => $desde, 'hasta' => $hastaExclusive]);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conciliacion bancaria - Starlim</title>
    <link rel="stylesheet" href="../css/global.css"><link rel="stylesheet" href="../css/styleEmpleado.css"><link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.conciliacion_bancaria'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head">
        <div>
            <p class="exec-kicker">Administracion</p>
            <h1>Conciliacion bancaria</h1>
            <p>Controla extractos bancarios contra cobros y pagos registrados. No reemplaza Tesoreria ni Cobros y Pagos.</p>
        </div>
        <a class="exec-btn exec-btn--ghost" href="panel_cobros_pagos.php?tab=registro">Ver registro de pagos</a>
    </header>

    <?php if ($notice): ?><p class="exec-empty exec-empty-ok"><?= ar_h($notice) ?></p><?php endif; ?>
    <?php if ($error): ?><p class="exec-empty"><?= ar_h($error) ?></p><?php endif; ?>

    <form class="admin-filterbar" method="GET">
        <label><span>Desde</span><input type="date" name="desde" value="<?= ar_h($desde) ?>"></label>
        <label><span>Hasta</span><input type="date" name="hasta" value="<?= ar_h($hasta) ?>"></label>
        <label><span>Cuenta</span><select name="cuenta"><option value="">Todas</option><?php foreach ($accounts as $a): ?><option value="<?= (int)$a['id'] ?>" <?= $accountFilter === (int)$a['id'] ? 'selected' : '' ?>><?= ar_h($a['nombre']) ?></option><?php endforeach; ?></select></label>
        <label><span>Estado</span><select name="estado"><option value="">Todos</option><option value="pending" <?= $statusFilter==='pending'?'selected':'' ?>>Pendiente</option><option value="partial" <?= $statusFilter==='partial'?'selected':'' ?>>Parcial</option><option value="matched" <?= $statusFilter==='matched'?'selected':'' ?>>Conciliado</option><option value="ignored" <?= $statusFilter==='ignored'?'selected':'' ?>>Ignorado</option></select></label>
        <div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Filtrar</button></div>
    </form>

    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Creditos banco</span><small>Extractos cargados.</small></div><strong><?= ar_money($summary['creditos_banco']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Debitos banco</span><small>Extractos cargados.</small></div><strong><?= ar_money($summary['debitos_banco']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Conciliado</span><small>Matches confirmados.</small></div><strong><?= ar_money($summary['conciliado']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Pendientes</span><small>Lineas no cerradas.</small></div><strong><?= ar_int($summary['lineas_pendientes']) ?></strong></article>
    </section>

    <section class="admin-treasury-split">
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Extracto bancario</h2><p>Movimientos cargados por cuenta.</p></div></div>
            <?php if (!$lines): ?><p class="exec-empty">No hay extractos cargados para el filtro seleccionado.</p><?php else: ?>
                <div class="admin-treasury-table">
                    <div class="admin-treasury-row admin-treasury-row--head"><span>Fecha</span><span>Cuenta</span><span>Descripcion</span><span>Pendiente</span></div>
                    <?php foreach ($lines as $line): ?>
                        <div class="admin-treasury-row">
                            <span><?= ar_date($line['fecha']) ?></span>
                            <strong><?= ar_h($line['cuenta']) ?><small><?= ar_h($line['status']) ?></small></strong>
                            <span><?= ar_h($line['descripcion'] ?: $line['referencia']) ?></span>
                            <b><?= ar_money($line['pendiente']) ?></b>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Movimientos del sistema</h2><p>Cobros y pagos pendientes de conciliar.</p></div></div>
            <?php if (!$systemMovements): ?><p class="exec-empty">No hay movimientos del sistema pendientes para este rango.</p><?php else: ?>
                <div class="exec-kpi-list">
                    <?php foreach (array_slice($systemMovements, 0, 20) as $mov): ?>
                        <div><span><?= ar_h(ucfirst($mov['tipo']) . ' - ' . ($mov['entidad_nombre'] ?: 'Sin entidad')) ?><small><?= ar_date($mov['fecha']) ?> · #<?= (int)$mov['id'] ?></small></span><strong><?= ar_money($mov['pendiente']) ?></strong></div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
    </section>

    <?php if ($canEdit): ?>
        <section class="admin-treasury-split">
            <article class="admin-card">
                <div class="admin-card-head"><div><h2>Cargar extracto</h2><p>Alta manual hasta incorporar importador CSV/API bancaria.</p></div></div>
                <form class="admin-mini-form" method="POST">
                    <input type="hidden" name="csrf_admin" value="<?= ar_h($csrf) ?>"><input type="hidden" name="action" value="statement_line">
                    <label><span>Cuenta</span><select name="bank_account_id" required><?php foreach ($accounts as $a): ?><option value="<?= (int)$a['id'] ?>"><?= ar_h($a['nombre']) ?></option><?php endforeach; ?></select></label>
                    <label><span>Fecha</span><input type="date" name="fecha" required value="<?= date('Y-m-d') ?>"></label>
                    <label><span>Tipo</span><select name="tipo"><option value="credit">Credito / ingreso banco</option><option value="debit">Debito / egreso banco</option></select></label>
                    <label><span>Monto</span><input name="monto" inputmode="decimal" required></label>
                    <label><span>Descripcion</span><input name="descripcion" maxlength="240"></label>
                    <label><span>Referencia</span><input name="referencia" maxlength="160"></label>
                    <button class="exec-btn exec-btn--primary" type="submit">Cargar movimiento</button>
                </form>
            </article>
            <article class="admin-card">
                <div class="admin-card-head"><div><h2>Conciliar</h2><p>Selecciona una linea de extracto y un movimiento del sistema.</p></div></div>
                <form class="admin-mini-form" method="POST">
                    <input type="hidden" name="csrf_admin" value="<?= ar_h($csrf) ?>"><input type="hidden" name="action" value="match">
                    <label><span>Extracto</span><select name="statement_line_id" required><?php foreach ($lines as $line): ?><?php if (in_array($line['status'], ['pending','partial'], true)): ?><option value="<?= (int)$line['id'] ?>">#<?= (int)$line['id'] ?> · <?= ar_date($line['fecha']) ?> · <?= ar_money($line['pendiente']) ?></option><?php endif; ?><?php endforeach; ?></select></label>
                    <label><span>Movimiento sistema</span><select name="pago_registro_id" required><?php foreach ($systemMovements as $mov): ?><option value="<?= (int)$mov['id'] ?>">#<?= (int)$mov['id'] ?> · <?= ar_h($mov['tipo']) ?> · <?= ar_money($mov['pendiente']) ?> · <?= ar_h($mov['entidad_nombre']) ?></option><?php endforeach; ?></select></label>
                    <label><span>Monto a conciliar</span><input name="matched_amount" inputmode="decimal" required></label>
                    <label><span>Notas</span><textarea name="notas" rows="2"></textarea></label>
                    <button class="exec-btn exec-btn--primary" type="submit">Confirmar conciliacion</button>
                </form>
            </article>
        </section>

        <section class="admin-card">
            <div class="admin-card-head"><div><h2>Cuenta bancaria</h2><p>Alta de cuentas para clasificar extractos.</p></div></div>
            <form class="admin-mini-form admin-bank-account-form" method="POST">
                <input type="hidden" name="csrf_admin" value="<?= ar_h($csrf) ?>"><input type="hidden" name="action" value="account">
                <label><span>Nombre</span><input name="nombre" maxlength="120" required></label>
                <label><span>Banco</span><input name="banco" maxlength="120"></label>
                <label><span>Moneda</span><input name="moneda" maxlength="12" value="ARS"></label>
                <label><span>Tipo</span><input name="tipo_cuenta" maxlength="40"></label>
                <label><span>Alias</span><input name="alias_cuenta" maxlength="120"></label>
                <label><span>CBU enmascarado</span><input name="cbu_masked" maxlength="40" placeholder="****1234"></label>
                <button class="exec-btn exec-btn--ghost" type="submit">Agregar cuenta</button>
            </form>
        </section>
    <?php endif; ?>
</main>
<script src="../js/global.js"></script>
</body>
</html>
