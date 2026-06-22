from __future__ import annotations

import argparse
import datetime as dt
import decimal
import os
import pathlib
import re
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
PANEL = ROOT / "api" / "frontend" / "panel_empleados.php"


def load_env() -> dict[str, str]:
    values = dict(os.environ)
    env_path = ROOT / ".env"
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values.setdefault(key.strip(), value.strip())
    return values


def require_pg8000():
    try:
        import pg8000.native  # type: ignore
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "pg8000 no esta instalado. Ejecuta: python -m pip install --target %TEMP%\\codex_pg8000_pkg pg8000"
        ) from exc
    return pg8000.native


def period_bounds(today: dt.date, period: str) -> tuple[dt.datetime, dt.datetime, dt.datetime, dt.datetime]:
    start = today.replace(day=1)
    end = today + dt.timedelta(days=1)
    if period == "hoy":
        start = today
    elif period == "7d":
        start = today - dt.timedelta(days=6)
    elif period == "30d":
        start = today - dt.timedelta(days=29)
    elif period == "mes_anterior":
        start_this_month = today.replace(day=1)
        last_prev = start_this_month - dt.timedelta(days=1)
        start = last_prev.replace(day=1)
        end = start_this_month
    elif period == "anio_actual":
        start = today.replace(month=1, day=1)
    days = max(1, (end - start).days)
    prev_end = start
    prev_start = start - dt.timedelta(days=days)
    return (
        dt.datetime.combine(start, dt.time.min),
        dt.datetime.combine(end, dt.time.min),
        dt.datetime.combine(prev_start, dt.time.min),
        dt.datetime.combine(prev_end, dt.time.min),
    )


def money_ar(value: decimal.Decimal) -> str:
    quantized = value.quantize(decimal.Decimal("0.01"))
    sign = "-" if quantized < 0 else ""
    whole, cents = f"{abs(quantized):.2f}".split(".")
    groups: list[str] = []
    while whole:
        groups.append(whole[-3:])
        whole = whole[:-3]
    return f"$ {sign}{'.'.join(reversed(groups))},{cents}"


def run_query(conn, sql: str, **params):
    return conn.run(sql, **params)


def kpi_query(conn, empresa: int, start: dt.datetime, end: dt.datetime):
    rows = run_query(
        conn,
        """
        WITH note_adjustments AS (
            SELECT id_venta,
                   COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0) AS ajuste
            FROM comprobantes_venta
            WHERE empresa_id = :notes_empresa
              AND id_venta IS NOT NULL
            GROUP BY id_venta
        ),
        valid_sales AS (
            SELECT
                v.id,
                v.fecha,
                (v.monto + COALESCE(na.ajuste, 0))::numeric AS net_amount,
                COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(v.dni_cliente, ''), '[^0-9]', '', 'g'), ''),
                         NULLIF('nombre:' || LOWER(TRIM(COALESCE(v.nombre_cliente, ''))), 'nombre:'),
                         'venta:' || v.id::text) AS client_key
            FROM ventas v
            LEFT JOIN note_adjustments na ON na.id_venta = v.id
            WHERE v.empresa_id = :empresa
              AND v.fecha >= :desde
              AND v.fecha < :hasta
              AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
        )
        SELECT
            COUNT(DISTINCT id)::int AS pedidos,
            ROUND(COALESCE(SUM(net_amount), 0), 2) AS ventas_netas,
            CASE WHEN COUNT(DISTINCT id) = 0 THEN NULL ELSE ROUND(SUM(net_amount) / COUNT(DISTINCT id), 2) END AS ticket_promedio,
            COUNT(DISTINCT client_key)::int AS clientes_activos,
            COUNT(*)::int AS rows_after_join
        FROM valid_sales
        """,
        notes_empresa=empresa,
        empresa=empresa,
        desde=start,
        hasta=end,
    )
    return rows[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--period", default="mes_actual", choices=["hoy", "7d", "30d", "mes_actual", "mes_anterior", "anio_actual"])
    parser.add_argument("--today", default=dt.date.today().isoformat())
    parser.add_argument("--empresa", type=int, default=1)
    args = parser.parse_args()

    panel_source = PANEL.read_text(encoding="utf-8", errors="ignore")
    forbidden = [
        "Estado del inventario",
        "Actividad reciente",
        "stock_modificaciones",
        "exec-inventory-card",
        "exec-activity-card",
        "exec-activity-list",
    ]
    found = [token for token in forbidden if token in panel_source]
    assert not found, f"Residuos prohibidos en panel_empleados.php: {found}"
    assert "exec-searchbar" in panel_source and "busqueda_ventas" in panel_source, "El buscador global no esta presente"
    assert "erp_money(" not in panel_source, "El dashboard no debe usar formateo abreviado heredado"
    assert "<polyline" not in panel_source, "El grafico debe usar curvas SVG path, no polyline"

    env = load_env()
    pg8000 = require_pg8000()
    conn = pg8000.Connection(
        host=env["SUPABASE_DB_HOST"],
        port=int(env.get("SUPABASE_DB_PORT", "6543")),
        database=env.get("SUPABASE_DB_NAME", "postgres"),
        user=env["SUPABASE_DB_USER"],
        password=env["SUPABASE_DB_PASS"],
        ssl_context=True,
    )
    try:
        today = dt.date.fromisoformat(args.today)
        start, end, prev_start, prev_end = period_bounds(today, args.period)
        current = kpi_query(conn, args.empresa, start, end)
        previous = kpi_query(conn, args.empresa, prev_start, prev_end)

        pedidos = int(current[0])
        ventas = decimal.Decimal(str(current[1]))
        ticket = None if current[2] is None else decimal.Decimal(str(current[2]))
        clientes = int(current[3])
        joined_rows = int(current[4])

        assert pedidos == joined_rows, "La consulta multiplica registros por joins"
        if pedidos == 0:
            assert ticket is None, "Sin operaciones debe devolver ticket NULL"
        else:
            assert ticket == (ventas / decimal.Decimal(pedidos)).quantize(decimal.Decimal("0.01")), "Ticket promedio inconsistente"

        invalid_rows = run_query(
            conn,
            """
            SELECT COUNT(*)::int
            FROM ventas
            WHERE empresa_id = :empresa
              AND fecha >= :desde
              AND fecha < :hasta
              AND COALESCE(estado_pedido, 'entregado') <> 'entregado'
            """,
            empresa=args.empresa,
            desde=start,
            hasta=end,
        )[0][0]

        notes = run_query(
            conn,
            """
            SELECT COUNT(*)::int,
                   ROUND(COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0), 2)
            FROM comprobantes_venta
            WHERE empresa_id = :empresa
              AND id_venta IS NOT NULL
            """,
            empresa=args.empresa,
        )[0]

        no_data = kpi_query(conn, args.empresa, dt.datetime(1900, 1, 1), dt.datetime(1900, 1, 2))
        assert int(no_data[0]) == 0 and decimal.Decimal(str(no_data[1])) == decimal.Decimal("0.00"), "Estado sin datos inconsistente"

        for bucket in ("hour", "day", "week", "month"):
            check = run_query(conn, "SELECT date_trunc(:bucket, NOW()) IS NOT NULL", bucket=bucket)[0][0]
            assert check is True, f"Agrupacion {bucket} no disponible"

        print("Dashboard metrics check OK")
        print(f"Periodo: {start.date()} a {(end - dt.timedelta(days=1)).date()}")
        print(f"Ventas netas: {money_ar(ventas)}")
        print(f"Pedidos validos: {pedidos}")
        print(f"Clientes activos: {clientes}")
        print(f"Ticket promedio: {'Sin operaciones' if ticket is None else money_ar(ticket)}")
        print(f"Periodo anterior pedidos: {int(previous[0])}")
        print(f"Registros excluidos por estado no valido: {int(invalid_rows)}")
        print(f"Notas/debitos-creditos vinculados: {int(notes[0])}; ajuste neto: {money_ar(decimal.Decimal(str(notes[1])))}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
