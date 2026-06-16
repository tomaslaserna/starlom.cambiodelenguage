<?php
/**
 * seguimiento_lib.php — Cálculo del seguimiento de recompra de clientes.
 *
 * Precisión: en vez del promedio simple del lapso total, usa los intervalos
 * REALES entre compras consecutivas y los combina así:
 *   1. Mediana de los intervalos (referencia robusta).
 *   2. Winsorizado: cada intervalo se acota a [0,3× , 3×] la mediana (si hay
 *      ≥3 intervalos), para que una vacación o una recompra urgente puntual
 *      no distorsione el promedio.
 *   3. Promedio ponderado por recencia (pesos 1..k): el ritmo reciente pesa
 *      más que el viejo, así detecta cambios de hábito del cliente.
 * Además devuelve el desvío (regularidad) y la confianza (nº de intervalos).
 *
 * Clasificación (relativa al promedio de cada cliente), r = días desde la
 * última compra ÷ promedio:
 *   Contactar 0,85 ≤ r ≤ 1,25 · En riesgo 1,25 < r ≤ 2 · Perdido r > 2.
 */

/** Métricas de intervalos a partir de timestamps (midnight) ascendentes y distintos. */
function starlim_seg_metricas(array $ts): array {
    $n = count($ts);
    $gaps = [];
    for ($i = 1; $i < $n; $i++) {
        $gaps[] = (int) round(($ts[$i] - $ts[$i - 1]) / 86400);
    }
    $k = count($gaps);
    if ($k === 0) return ['promedio' => 1, 'desvio' => 0, 'k' => 0];

    // Mediana
    $ord = $gaps; sort($ord);
    $median = ($k % 2) ? $ord[intdiv($k, 2)] : ($ord[$k / 2 - 1] + $ord[$k / 2]) / 2;
    if ($median < 1) $median = 1;

    // Winsorizado (solo con suficientes intervalos)
    $proc = [];
    foreach ($gaps as $g) {
        if ($k >= 3) { $g = max($median * 0.3, min($median * 3, $g)); }
        $proc[] = $g;
    }

    // Promedio ponderado por recencia (pesos 1..k, el más reciente pesa k)
    $num = 0; $den = 0;
    for ($i = 0; $i < $k; $i++) { $w = $i + 1; $num += $w * $proc[$i]; $den += $w; }
    $promedio = max(1, (int) round($num / $den));

    // Desvío estándar (poblacional) de los intervalos crudos → regularidad
    $mean = array_sum($gaps) / $k;
    $var = 0; foreach ($gaps as $g) $var += ($g - $mean) ** 2;
    $desvio = (int) round(sqrt($var / $k));

    return ['promedio' => $promedio, 'desvio' => $desvio, 'k' => $k];
}

/**
 * Devuelve ['grupos' => ['contactar'=>[], 'riesgo'=>[], 'perdido'=>[]], 'vendedores'=>[]].
 */
function starlim_calcular_seguimiento($conexion): array {
    $res = $conexion->query("
        SELECT c.id, c.nombre_cliente, COALESCE(c.telefono,'') AS telefono, COALESCE(c.vendedor_cl,'') AS vendedor, d.fecha
        FROM (
            SELECT DISTINCT dni_cliente, fecha
            FROM ventas
            WHERE COALESCE(estado_pedido,'entregado') = 'entregado' AND dni_cliente NOT IN ('0','')
        ) d
        JOIN clientes c ON REPLACE(REPLACE(c.nro_id,'-',''),' ','') = d.dni_cliente AND c.nro_id <> ''
        ORDER BY c.id, d.fecha
    ");

    // Agrupar fechas por cliente
    $cli = [];
    if ($res) while ($r = $res->fetch_assoc()) {
        $id = (int) $r['id'];
        if (!isset($cli[$id])) $cli[$id] = ['nombre' => $r['nombre_cliente'], 'telefono' => $r['telefono'], 'vendedor' => $r['vendedor'], 'ts' => []];
        $cli[$id]['ts'][] = strtotime($r['fecha']);
    }

    $hoy = strtotime((new DateTime('now', new DateTimeZone('America/Argentina/Buenos_Aires')))->format('Y-m-d'));
    $grupos = ['contactar' => [], 'riesgo' => [], 'perdido' => []];
    $vendedores = [];

    foreach ($cli as $id => $c) {
        $ts = $c['ts'];
        if (count($ts) < 2) continue;
        sort($ts);
        $m = starlim_seg_metricas($ts);
        $promedio = $m['promedio'];
        $ultima   = end($ts);
        $desde    = (int) floor(($hoy - $ultima) / 86400);
        $ratio    = $promedio > 0 ? $desde / $promedio : 0;
        if ($ratio < 0.85) continue;   // todavía no toca

        $fila = [
            'nombre_cliente' => $c['nombre'],
            'telefono'   => $c['telefono'],
            'vendedor'   => $c['vendedor'],
            'promedio'   => $promedio,
            'desvio'     => $m['desvio'],
            'intervalos' => $m['k'],
            'desde_ult'  => $desde,
            'atraso'     => (int) round($desde - $promedio),
            'ultima_fmt' => date('d-m-Y', $ultima),
            'proxima'    => date('d-m-Y', $ultima + $promedio * 86400),
            'ratio'      => $ratio,
        ];
        if ($c['vendedor'] !== '') $vendedores[$c['vendedor']] = true;

        if      ($ratio <= 1.25) $grupos['contactar'][] = $fila;
        elseif  ($ratio <= 2.00) $grupos['riesgo'][]    = $fila;
        else                     $grupos['perdido'][]   = $fila;
    }

    usort($grupos['contactar'], fn($a, $b) => $b['ratio']  <=> $a['ratio']);
    usort($grupos['riesgo'],    fn($a, $b) => $b['atraso'] <=> $a['atraso']);
    usort($grupos['perdido'],   fn($a, $b) => $b['atraso'] <=> $a['atraso']);

    ksort($vendedores);
    return ['grupos' => $grupos, 'vendedores' => array_keys($vendedores)];
}
