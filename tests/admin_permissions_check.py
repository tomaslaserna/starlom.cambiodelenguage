from __future__ import annotations

import os
import pathlib


ROOT = pathlib.Path(__file__).resolve().parents[1]


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


def main() -> int:
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
        resources = conn.run("SELECT COUNT(*) FROM admin_resources WHERE activo = TRUE")[0][0]
        permissions = conn.run("SELECT COUNT(*) FROM app_permisos WHERE clave LIKE 'admin.%'")[0][0]
        admin_role_permissions = conn.run(
            """
            SELECT COUNT(*)
            FROM app_rol_permisos rp
            JOIN app_roles r ON r.id = rp.id_rol
            JOIN app_permisos p ON p.id = rp.id_permiso
            WHERE r.clave = 'Admin'
              AND p.clave LIKE 'admin.%'
            """
        )[0][0]
        non_admin_role_permissions = conn.run(
            """
            SELECT COUNT(*)
            FROM app_rol_permisos rp
            JOIN app_roles r ON r.id = rp.id_rol
            JOIN app_permisos p ON p.id = rp.id_permiso
            WHERE r.clave <> 'Admin'
              AND p.clave LIKE 'admin.%'
            """
        )[0][0]
        rls = dict(
            conn.run(
                """
                SELECT relname, relrowsecurity
                FROM pg_class
                WHERE relname IN (
                    'admin_resources',
                    'admin_audit_log',
                    'admin_bank_accounts',
                    'admin_bank_statement_lines',
                    'admin_bank_reconciliation_matches'
                )
                """
            )
        )

        assert resources == 14, f"Recursos admin esperados: 14, actuales: {resources}"
        assert permissions == 36, f"Permisos admin esperados: 36, actuales: {permissions}"
        assert admin_role_permissions == permissions, "Admin debe heredar todos los permisos admin"
        assert non_admin_role_permissions == 0, "Ningun rol no-Admin debe heredar permisos admin por defecto"
        assert rls.get("admin_resources") is True, "admin_resources debe tener RLS habilitado"
        assert rls.get("admin_audit_log") is True, "admin_audit_log debe tener RLS habilitado"
        assert rls.get("admin_bank_accounts") is True, "admin_bank_accounts debe tener RLS habilitado"
        assert rls.get("admin_bank_statement_lines") is True, "admin_bank_statement_lines debe tener RLS habilitado"
        assert rls.get("admin_bank_reconciliation_matches") is True, "admin_bank_reconciliation_matches debe tener RLS habilitado"

        print("Admin permissions check OK")
        print(f"Recursos admin: {resources}")
        print(f"Permisos admin: {permissions}")
        print(f"Permisos admin heredados por Admin: {admin_role_permissions}")
        print(f"Permisos admin heredados por otros roles: {non_admin_role_permissions}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
