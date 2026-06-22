from __future__ import annotations

import ast
import json
import os
import re
import shutil
import socket
import ssl
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import request, error

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'
ARTIFACTS = ROOT / 'test-artifacts'
PROD_URL = os.environ.get('STARLIM_SMOKE_BASE_URL', 'https://star-lim-phi.vercel.app').rstrip('/')
TIMESTAMP = datetime.now().strftime('%Y%m%d-%H%M%S')
SECRET_KEYS = {'SUPABASE_DB_PASS','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','STARLIM_API_KEY','VERCEL_TOKEN','SUPABASE_SERVICE_ROLE_KEY'}
EXPECTED_ADMIN_RESOURCES = [
 'admin.panel','admin.tesoreria','admin.conciliacion_bancaria','admin.metricas','admin.movimientos','admin.cashflow','admin.balance','admin.dividendos','admin.sueldos','admin.calendario','admin.usuarios','admin.obligaciones_fiscales','admin.resultados','admin.cuentas_por_pagar'
]
DOCUMENTED_FRONTEND = ['index.php','sign.php','panel_empleados.php','pedidos.php','ventas.php','ventas_registradas.php','proceso_ventas.php','presupuestos.php','presupuestar.php','facturacion.php','factura_manual.php','panel_cobros_pagos.php','stock.php','new_stock.php','edit_stock.php','registro_stock.php','compras.php','panel_base_datos.php','clientes.php','productos.php','proveedores.php','recordatorios.php','gestion_empleados.php','admin_tesoreria.php','admin_conciliacion_bancaria.php','planilla_admin.php','admin_movimientos.php','admin_cashflow.php','admin_balance.php','admin_dividendos.php','admin_sueldos.php','admin_calendario.php','admin_obligaciones_fiscales.php','admin_resultados.php','admin_cuentas_por_pagar.php']
EXPECTED_TABLES = ['usuarios','empresas','usuario_empresa','app_roles','app_permisos','app_usuario_roles','app_usuario_permisos','secuencias_empresa','ventas','detalle_ventas','presupuestos','remitos','detalle_remitos','repartos','reparto_pedidos','clientes','proveedores','customer_fiscal_profile','productos','rubros','margenes','listas_precio','margenes_listas','compras_registro','detalle_compras_registro','stock_modificaciones','pagos_registro','cuentas_corrientes','billing_document','billing_document_line','billing_tax_line','fiscal_authorization','billing_payment_allocation','billing_event','billing_audit_log','fiscal_sync_job','admin_resources','admin_audit_log','admin_socios','admin_dividendos','admin_sueldos_config','admin_sueldo_movimientos','admin_obligaciones_fiscales','admin_bank_accounts','admin_bank_statement_lines','admin_bank_reconciliation_matches','eventos_integracion','ventas_modificaciones']

@dataclass
class TestResult:
    id: str
    layer: str
    module: str
    target: str
    test: str
    status: str
    expected: str
    obtained: str
    duration_ms: int
    evidence: str = ''
    severity: str = ''
    recommendation: str = ''


def run(cmd: list[str], timeout: int = 30) -> dict[str, Any]:
    start = time.time()
    try:
        p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
        return {'code': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr, 'duration_ms': int((time.time()-start)*1000)}
    except Exception as exc:
        return {'code': 999, 'stdout': '', 'stderr': repr(exc), 'duration_ms': int((time.time()-start)*1000)}


def redact(text: str) -> str:
    out = text or ''
    env = load_env(mask=False)
    for k, v in env.items():
        if k in SECRET_KEYS and v:
            out = out.replace(v, '[REDACTED]')
    out = re.sub(r'(postgres(?:ql)?://)[^\s]+', r'\1[REDACTED]', out, flags=re.I)
    out = re.sub(r'(SUPABASE_DB_PASS\s*=\s*).+', r'\1[REDACTED]', out)
    return out[:4000]


def load_env(mask: bool = True) -> dict[str,str]:
    vals = dict(os.environ)
    env = ROOT / '.env'
    if env.exists():
        for line in env.read_text(errors='ignore').splitlines():
            if '=' in line and not line.strip().startswith('#'):
                k, v = line.split('=', 1)
                vals.setdefault(k.strip(), v.strip())
    if mask:
        return {k: ('[REDACTED]' if k in SECRET_KEYS else v) for k, v in vals.items() if k.startswith(('SUPABASE','NEXT_PUBLIC_SUPABASE','STARLIM','VERCEL','PHP'))}
    return vals


def files(pattern: str) -> list[Path]:
    return sorted(p for p in ROOT.rglob(pattern) if '.git' not in p.parts and 'node_modules' not in p.parts and '.vercel' not in p.parts)


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT)).replace('\\','/')



def strip_php_comments_preserve_lines(text: str) -> str:
    def keep_lines(match):
        return '\n' * match.group(0).count('\n')
    text = re.sub(r'/\*.*?\*/', keep_lines, text, flags=re.S)
    text = re.sub(r'(?m)^\s*//.*$', '', text)
    text = re.sub(r'(?m)^\s*#.*$', '', text)
    return text
def discover() -> dict[str, Any]:
    php_files = files('*.php')
    js_files = files('*.js')
    css_files = files('*.css')
    sql_files = files('*.sql')
    frontend = sorted(rel(p) for p in (ROOT/'api'/'frontend').glob('*.php')) if (ROOT/'api'/'frontend').exists() else []
    endpoints = sorted(rel(p) for p in (ROOT/'api'/'php').glob('*.php')) if (ROOT/'api'/'php').exists() else []
    integrations = sorted(rel(p) for p in (ROOT/'api'/'integracion').glob('*.php')) if (ROOT/'api'/'integracion').exists() else []
    funcs = []
    includes = []
    forms = []
    superglobals = []
    sql_smells = []
    env_names = set(load_env(mask=True).keys())
    for p in php_files:
        txt = p.read_text(errors='ignore')
        for m in re.finditer(r'function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(', txt):
            funcs.append({'file': rel(p), 'name': m.group(1), 'line': txt[:m.start()].count('\n')+1})
        include_scan_txt = strip_php_comments_preserve_lines(txt)
        for m in re.finditer(r'(require_once|require|include_once|include)\s*(?:\(|\s)[\'\"]([^\'\"]+)', include_scan_txt):
            includes.append({'file': rel(p), 'type': m.group(1), 'target': m.group(2), 'line': include_scan_txt[:m.start()].count('\n')+1})
        for m in re.finditer(r'<form[^>]*>', txt, flags=re.I):
            tag = m.group(0)
            forms.append({'file': rel(p), 'line': txt[:m.start()].count('\n')+1, 'method': (re.search(r'method=[\'\"]([^\'\"]+)', tag, re.I) or ['','GET'])[1], 'action': (re.search(r'action=[\'\"]([^\'\"]*)', tag, re.I) or ['',''])[1]})
        for m in re.finditer(r'\$_(GET|POST|REQUEST|SERVER|SESSION)\[[^\]]+\]', txt):
            superglobals.append({'file': rel(p), 'expr': m.group(0), 'line': txt[:m.start()].count('\n')+1})
        for pat, label in [(r'DELETE\s+FROM', 'physical_delete'), (r'TRUNCATE\b', 'truncate'), (r'DROP\s+TABLE', 'drop_table'), (r'MAX\s*\(', 'max_function'), (r'max\s*\(', 'max_function'), (r'\(float\)|floatval', 'float_money_risk'), (r'SUPABASE_[A-Z_]+', 'supabase_env')]:
            for m in re.finditer(pat, txt, re.I):
                sql_smells.append({'file': rel(p), 'kind': label, 'line': txt[:m.start()].count('\n')+1, 'excerpt': txt[m.start():m.start()+120].replace('\n',' ')})
        for m in re.finditer(r'getenv\([\'\"]([^\'\"]+)|\$_ENV\[[\'\"]([^\'\"]+)|\$_SERVER\[[\'\"]([^\'\"]+)', txt):
            env_names.add(next(g for g in m.groups() if g))
    git = {'status': run(['git','status','--short'])['stdout'], 'branch': run(['git','branch','--show-current'])['stdout'].strip(), 'commit': run(['git','rev-parse','HEAD'])['stdout'].strip()}
    inv = {
        'generated_at': datetime.now().isoformat(), 'root': str(ROOT), 'git': git,
        'counts': {'php': len(php_files), 'js': len(js_files), 'css': len(css_files), 'sql': len(sql_files), 'frontend_routes': len(frontend), 'api_php_endpoints': len(endpoints), 'functions': len(funcs), 'forms': len(forms)},
        'directories': sorted(rel(p) for p in ROOT.rglob('*') if p.is_dir() and '.git' not in p.parts and 'node_modules' not in p.parts)[:500],
        'php_files': [rel(p) for p in php_files], 'js_files': [rel(p) for p in js_files], 'css_files': [rel(p) for p in css_files], 'sql_files': [rel(p) for p in sql_files],
        'frontend_routes': frontend, 'api_php_endpoints': endpoints, 'integration_endpoints': integrations,
        'functions': funcs, 'includes': includes, 'forms': forms, 'superglobals': superglobals[:500], 'sql_smells': sql_smells,
        'env_names': sorted(env_names), 'vercel_json': json.loads((ROOT/'vercel.json').read_text()) if (ROOT/'vercel.json').exists() else None,
        'composer_files': [rel(p) for p in files('composer.json')], 'package_files': [rel(p) for p in files('package.json')]
    }
    return inv


def add_result(results, *args, **kwargs):
    results.append(TestResult(*args, **kwargs))


class NoRedirectHandler(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_head_or_get(url: str, method='GET', timeout=12) -> tuple[int, dict[str,str], str]:
    req = request.Request(url, method=method, headers={'User-Agent':'StarlimSmokeQA/1.0'})
    opener = request.build_opener(NoRedirectHandler)
    try:
        with opener.open(req, timeout=timeout) as res:
            body = res.read(300000).decode('utf-8','ignore') if method != 'HEAD' else ''
            return res.status, dict(res.headers), body
    except error.HTTPError as e:
        body = e.read(300000).decode('utf-8','ignore') if method != 'HEAD' else ''
        return e.code, dict(e.headers), body

def vercel_mitigated(headers: dict[str, str]) -> bool:
    lower = {str(k).lower(): str(v) for k, v in headers.items()}
    return 'x-vercel-mitigated' in lower or 'x-vercel-challenge-token' in lower


def db_connect():
    env = load_env(mask=False)
    missing = [k for k in ['SUPABASE_DB_HOST','SUPABASE_DB_USER','SUPABASE_DB_PASS'] if not env.get(k)]
    if missing:
        return None, f'missing env: {", ".join(missing)}'
    try:
        import pg8000.native  # type: ignore
    except Exception as exc:
        return None, f'pg8000 unavailable: {exc}'
    try:
        conn = pg8000.native.Connection(user=env['SUPABASE_DB_USER'], password=env['SUPABASE_DB_PASS'], host=env['SUPABASE_DB_HOST'], port=int(env.get('SUPABASE_DB_PORT','5432')), database=env.get('SUPABASE_DB_NAME','postgres'), timeout=20)
        return conn, ''
    except Exception as exc:
        return None, f'connection failed: {type(exc).__name__}: {exc}'


def run_tests(inv: dict[str, Any]) -> list[TestResult]:
    results: list[TestResult] = []
    tid = 1
    def nid(prefix):
        nonlocal tid
        out = f'{prefix}-{tid:04d}'; tid += 1; return out

    # Static/tooling
    php = shutil.which('php')
    if php:
        for p in [Path(x) for x in inv['php_files']]:
            r = run([php, '-l', rel(p)], timeout=20)
            add_result(results, nid('STATIC'), 'static', 'php', rel(p), 'php -l syntax', 'PASS' if r['code']==0 else 'FAIL', 'No syntax errors', redact(r['stdout']+r['stderr']), r['duration_ms'], rel(p), severity='alta' if r['code'] else '')
    else:
        add_result(results, nid('STATIC'), 'static', 'php', 'all php files', 'php -l syntax', 'BLOCKED', 'PHP CLI available', 'php executable not found in PATH', 0, 'tooling')

    if (ROOT/'vercel.json').exists():
        try:
            json.loads((ROOT/'vercel.json').read_text())
            add_result(results, nid('STATIC'), 'static', 'vercel', 'vercel.json', 'JSON parse', 'PASS', 'Valid JSON', 'Parsed successfully', 0, 'vercel.json')
        except Exception as exc:
            add_result(results, nid('STATIC'), 'static', 'vercel', 'vercel.json', 'JSON parse', 'FAIL', 'Valid JSON', str(exc), 0, 'vercel.json', severity='alta')

    # Include existence heuristic
    for inc in inv['includes']:
        target = inc['target']
        if target.startswith(('http://','https://')) or '$' in target:
            status, obtained = 'WARNING', 'dynamic/external include not resolved statically'
        else:
            base = ROOT / inc['file']
            candidate = (base.parent / target).resolve()
            status = 'PASS' if candidate.exists() else 'FAIL'
            obtained = 'exists' if candidate.exists() else f'missing: {target}'
        add_result(results, nid('STATIC'), 'static', 'includes', inc['file'], f"include {target}", status, 'Include target resolvable or dynamic documented', obtained, 0, inc['file'], severity='alta' if status=='FAIL' else '')

    # Secret scan names only, no values
    secret_hits = []
    for p in files('*'):
        if p.is_file() and p.suffix.lower() in {'.php','.js','.json','.sql','.md','.env','.example','.txt'} and p.stat().st_size < 500000:
            txt = p.read_text(errors='ignore')
            for pat in [r'service_role', r'PRIVATE KEY', r'SUPABASE_DB_PASS\s*=', r'AIza[0-9A-Za-z_-]{20,}', r'slk_[A-Za-z0-9]{20,}']:
                if re.search(pat, txt, re.I):
                    secret_hits.append(rel(p))
                    break
    add_result(results, nid('SEC'), 'static', 'secrets', 'repository', 'secret pattern scan', 'WARNING' if secret_hits else 'PASS', 'No obvious secrets committed', f'{len(secret_hits)} files flagged: {secret_hits[:20]}', 0, 'rg-like scan', severity='alta' if secret_hits else '')

    # DB read-only
    conn, db_err = db_connect()
    if conn is None:
        add_result(results, nid('DB'), 'database', 'connectivity', 'Supabase', 'SELECT 1', 'BLOCKED', 'DB connection using configured env', redact(db_err), 0, 'env/db')
    else:
        start = time.time()
        try:
            val = conn.run('select 1')[0][0]
            add_result(results, nid('DB'), 'database', 'connectivity', 'Supabase', 'SELECT 1', 'PASS' if val==1 else 'FAIL', '1', str(val), int((time.time()-start)*1000), 'select 1')
        except Exception as exc:
            add_result(results, nid('DB'), 'database', 'connectivity', 'Supabase', 'SELECT 1', 'FAIL', '1', redact(str(exc)), int((time.time()-start)*1000), 'select 1', severity='critica')
        for t in EXPECTED_TABLES:
            start = time.time()
            try:
                rows = conn.run("select count(*) from information_schema.tables where table_schema='public' and table_name=:t", t=t)
                ok = rows[0][0] == 1
                add_result(results, nid('DB'), 'database', 'schema', t, 'expected table exists', 'PASS' if ok else 'FAIL', 'table exists', str(rows[0][0]), int((time.time()-start)*1000), 'information_schema.tables', severity='alta' if not ok else '')
            except Exception as exc:
                add_result(results, nid('DB'), 'database', 'schema', t, 'expected table exists', 'FAIL', 'table exists', redact(str(exc)), int((time.time()-start)*1000), 'information_schema.tables', severity='alta')
        for res in EXPECTED_ADMIN_RESOURCES:
            start = time.time()
            try:
                rows = conn.run('select count(*) from admin_resources where clave=:r and activo=true', r=res)
                ok = rows[0][0] == 1
                add_result(results, nid('PERM'), 'database', 'permissions', res, 'admin resource exists', 'PASS' if ok else 'FAIL', '1 active resource', str(rows[0][0]), int((time.time()-start)*1000), 'admin_resources', severity='alta' if not ok else '')
            except Exception as exc:
                add_result(results, nid('PERM'), 'database', 'permissions', res, 'admin resource exists', 'FAIL', '1 active resource', redact(str(exc)), int((time.time()-start)*1000), 'admin_resources', severity='alta')
        try:
            permissions = conn.run("select count(*) from app_permisos where clave like 'admin.%'")[0][0]
            admin_inherit = conn.run("select count(*) from app_rol_permisos rp join app_roles r on r.id=rp.id_rol join app_permisos p on p.id=rp.id_permiso where r.clave='Admin' and p.clave like 'admin.%'")[0][0]
            non_admin = conn.run("select count(*) from app_rol_permisos rp join app_roles r on r.id=rp.id_rol join app_permisos p on p.id=rp.id_permiso where r.clave<>'Admin' and p.clave like 'admin.%'")[0][0]
            add_result(results, nid('PERM'), 'database', 'permissions', 'Admin', 'Admin inherits all admin permissions', 'PASS' if permissions == admin_inherit else 'FAIL', str(permissions), str(admin_inherit), 0, 'app_rol_permisos', severity='alta' if permissions != admin_inherit else '')
            add_result(results, nid('PERM'), 'database', 'permissions', 'non-Admin roles', 'Non-admin roles do not inherit admin by default', 'PASS' if non_admin == 0 else 'FAIL', '0', str(non_admin), 0, 'app_rol_permisos', severity='alta' if non_admin else '')
        except Exception as exc:
            add_result(results, nid('PERM'), 'database', 'permissions', 'roles', 'permission inheritance', 'FAIL', 'query succeeds', redact(str(exc)), 0, 'app_rol_permisos', severity='alta')
        try:
            business = ['ventas','detalle_ventas','presupuestos','remitos','clientes','productos','proveedores','compras_registro','pagos_registro','cuentas_corrientes']
            rows = conn.run("select table_name from information_schema.columns where table_schema='public' and column_name='empresa_id'")
            has = {r[0] for r in rows}
            missing = [t for t in business if t not in has]
            add_result(results, nid('TENANT'), 'database', 'multiempresa', 'business tables', 'empresa_id coverage', 'PASS' if not missing else 'FAIL', 'all key tables have empresa_id', 'missing: '+','.join(missing) if missing else 'all present', 0, 'information_schema.columns', severity='alta' if missing else '')
        except Exception as exc:
            add_result(results, nid('TENANT'), 'database', 'multiempresa', 'business tables', 'empresa_id coverage', 'FAIL', 'query succeeds', redact(str(exc)), 0, 'information_schema.columns', severity='alta')
        conn.close()

    # Production read-only
    for path in ['/', '/frontend/index.php', '/frontend/sign.php', '/frontend/panel_empleados.php', '/frontend/admin_conciliacion_bancaria.php']:
        start = time.time()
        try:
            code, headers, body = http_head_or_get(PROD_URL + path, 'GET')
            expected = '200/308 for public, 302/401/403 for protected'
            protected = 'panel_empleados' in path or 'admin_' in path
            mitigated = vercel_mitigated(headers)
            ok = (code in (200,308) if not protected else code in (302,401,403))
            bad_php = bool(re.search(r'(Fatal error|Warning:|Notice:|Stack trace)', body, re.I))
            status = 'BLOCKED' if mitigated else ('PASS' if ok and not bad_php else 'FAIL')
            obtained = f'status={code}; location={headers.get("Location","")}; php_error={bad_php}; vercel_mitigated={mitigated}'
            add_result(results, nid('PROD'), 'production-readonly', 'http', path, 'GET route smoke', status, expected, obtained, int((time.time()-start)*1000), PROD_URL+path, severity='alta' if status=='FAIL' else '')
        except Exception as exc:
            add_result(results, nid('PROD'), 'production-readonly', 'http', path, 'GET route smoke', 'BLOCKED', 'HTTP reachable', redact(str(exc)), int((time.time()-start)*1000), PROD_URL+path)
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection(('star-lim-phi.vercel.app', 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname='star-lim-phi.vercel.app') as ssock:
                cert = ssock.getpeercert()
        add_result(results, nid('PROD'), 'production-readonly', 'tls', 'star-lim-phi.vercel.app', 'TLS certificate', 'PASS', 'valid certificate returned', cert.get('notAfter',''), 0, 'ssl')
    except Exception as exc:
        add_result(results, nid('PROD'), 'production-readonly', 'tls', 'star-lim-phi.vercel.app', 'TLS certificate', 'FAIL', 'valid certificate', redact(str(exc)), 0, 'ssl', severity='alta')

    # E2E/auth/business write flows blocked unless explicitly non-prod and credentials exist
    for flow in ['Admin login E2E','Limited user E2E','Cliente-presupuesto-venta-entrega-cobro','Compra-stock-pago','Conciliacion bancaria write flow','Facturacion fiscal authorization']:
        add_result(results, nid('E2E'), 'e2e/business', 'safe-write-flows', flow, 'safe write flow gate', 'BLOCKED', 'Safe test/staging credentials and writable test tenant', 'No non-production writable environment or test credentials were provided; production is read-only by prompt.', 0, 'safety gate')
    return results


def coverage_matrix(inv):
    lines = ['# Starlim Coverage Matrix','', '| Tipo | Item | Metodo de prueba | Estado |', '|---|---|---|---|']
    for r in inv['frontend_routes']:
        lines.append(f'| Ruta frontend | `{r}` | GET anon/protegido + E2E segun permisos | Planned/partial |')
    for e in inv['api_php_endpoints'] + inv['integration_endpoints']:
        lines.append(f'| Endpoint PHP | `{e}` | metodo permitido/no permitido, auth, payload, DB | Planned/partial |')
    for f in inv['functions']:
        lines.append(f"| Funcion PHP | `{f['name']}` en `{f['file']}:{f['line']}` | unidad/integracion via endpoint o brecha | Planned |")
    for t in EXPECTED_TABLES:
        lines.append(f'| Tabla/objeto DB | `{t}` | information_schema + consulta no destructiva | Planned/partial |')
    return '\n'.join(lines) + '\n'


def report_md(inv, results):
    counts = {s: sum(1 for r in results if r.status == s) for s in ['PASS','FAIL','BLOCKED','WARNING','NOT_APPLICABLE']}
    global_status = 'FAIL' if counts['FAIL'] else ('BLOCKED' if counts['BLOCKED'] else 'PASS')
    route_total = len(inv['frontend_routes']) or 1
    endpoint_total = len(inv['api_php_endpoints']) + len(inv['integration_endpoints']) or 1
    route_covered = sum(1 for r in results if r.layer.startswith('production') and 'route' in r.test)
    endpoint_covered = 0
    lines = [f'RESULTADO GLOBAL: {global_status}', '', f'- Fecha y hora: {datetime.now().isoformat()}', f'- Rama: {inv["git"].get("branch")}', f'- Commit: {inv["git"].get("commit")}', f'- Entorno probado: repo local + Supabase configurado + produccion solo lectura', f'- URL probada: {PROD_URL}', f'- Base/proyecto: Supabase configurado por variables locales (valores redactados)', f'- PASS: {counts["PASS"]}', f'- FAIL: {counts["FAIL"]}', f'- BLOCKED: {counts["BLOCKED"]}', f'- WARNING: {counts["WARNING"]}', f'- Rutas cubiertas: {round(route_covered/route_total*100,2)}%', f'- Endpoints cubiertos: {round(endpoint_covered/endpoint_total*100,2)}%', f'- Funciones de negocio cubiertas: 0% directo; cobertura indirecta documentada en matriz', f'- Datos de prueba creados: ninguno', f'- Produccion modificada: NO', '', '## Tabla de resultados', '', '| ID | Capa | Modulo | Ruta/endpoint/tabla | Prueba | Estado | Esperado | Obtenido | Duracion | Evidencia |', '|---|---|---|---|---|---|---|---|---:|---|']
    for r in results:
        lines.append(f'| {r.id} | {r.layer} | {r.module} | `{r.target}` | {r.test} | {r.status} | {r.expected} | {redact(r.obtained).replace("|","/")} | {r.duration_ms}ms | {r.evidence} |')
    for title in ['Build y analisis estatico','Base de datos','Backend','Autenticacion y sesiones','Permisos','Multiempresa','Frontend','Ventas y pedidos','Stock','Compras','Cobros y cuentas corrientes','Tesoreria y cash flow','Conciliacion bancaria','Facturacion','Administracion','Auditoria','Produccion de solo lectura','Riesgos criticos','Brechas de cobertura','Recomendaciones priorizadas']:
        lines += ['', f'## {title}']
        subset = [r for r in results if title.lower().split()[0] in (r.layer+' '+r.module+' '+r.target+' '+r.test).lower()]
        if subset:
            for r in subset[:25]: lines.append(f'- {r.status}: {r.id} - {r.test} - {r.target}')
        else:
            lines.append('- Ver tabla principal y matriz de cobertura. Algunos flujos quedan BLOCKED por no existir entorno test seguro o credenciales de prueba.')
    fails = [r for r in results if r.status == 'FAIL']
    if fails:
        lines += ['', '## Detalle de FAIL']
        for r in fails:
            lines += ['', f'### {r.id} - {r.test}', f'- Severidad: {r.severity or "media"}', f'- Intento: {r.test} sobre {r.target}', f'- Esperado: {r.expected}', f'- Obtenido: {redact(r.obtained)}', f'- Evidencia: {r.evidence}', f'- Causa probable: inconsistencia de codigo, configuracion o esquema detectada por la prueba.', f'- Impacto funcional: revisar antes de considerar el modulo estable.', f'- Correccion recomendada: {r.recommendation or "corregir causa y re-ejecutar este test."}']
    blocked = [r for r in results if r.status == 'BLOCKED']
    if blocked:
        lines += ['', '## Detalle de BLOCKED']
        for r in blocked:
            lines += ['', f'### {r.id} - {r.test}', f'- Motivo exacto: {redact(r.obtained)}', '- Variable/credencial/servicio faltante: ver motivo; no se incluyen valores secretos.', f'- Pruebas afectadas: {r.layer}/{r.module}', '- Como desbloquearlo: proveer entorno local/staging seguro, credenciales de prueba o herramienta faltante.']
    lines += ['', '## Resumen consola', '```', '========================================', 'STARLIM SYSTEM TEST', f'Resultado: {global_status}', f'PASS: {counts["PASS"]}', f'FAIL: {counts["FAIL"]}', f'BLOCKED: {counts["BLOCKED"]}', f'WARNING: {counts["WARNING"]}', f'Rutas cubiertas: {round(route_covered/route_total*100,2)}%', f'Endpoints cubiertos: {round(endpoint_covered/endpoint_total*100,2)}%', f'Reporte: reports/starlim-system-test-{TIMESTAMP}.md', '========================================', '```']
    return '\n'.join(lines) + '\n', global_status, counts


def write_env_example():
    path = ROOT / '.env.smoke.example'
    path.write_text('\n'.join([
        '# Starlim smoke/system test variables. Do not put real secrets in this example.',
        'STARLIM_SMOKE_BASE_URL=https://star-lim-phi.vercel.app',
        'STARLIM_TEST_ENV=production-readonly  # production-readonly | staging | local',
        'STARLIM_TEST_ADMIN_USER=',
        'STARLIM_TEST_ADMIN_PASS=',
        'STARLIM_TEST_LIMITED_USER=',
        'STARLIM_TEST_LIMITED_PASS=',
        'STARLIM_TEST_EMPRESA_ID=',
        'SUPABASE_DB_HOST=',
        'SUPABASE_DB_PORT=',
        'SUPABASE_DB_NAME=',
        'SUPABASE_DB_USER=',
        'SUPABASE_DB_PASS=',
        'NEXT_PUBLIC_SUPABASE_URL=',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=',
        'STARLIM_API_KEY=',
        ''
    ]), encoding='utf-8')


def main():
    REPORTS.mkdir(exist_ok=True)
    (ARTIFACTS/'screenshots').mkdir(parents=True, exist_ok=True)
    (ARTIFACTS/'traces').mkdir(parents=True, exist_ok=True)
    (ARTIFACTS/'logs').mkdir(parents=True, exist_ok=True)
    inv = discover()
    write_env_example()
    (REPORTS/'starlim-inventory.json').write_text(json.dumps(inv, indent=2, ensure_ascii=False), encoding='utf-8')
    (REPORTS/'starlim-coverage-matrix.md').write_text(coverage_matrix(inv), encoding='utf-8')
    results = run_tests(inv)
    md, global_status, counts = report_md(inv, results)
    report_base = f'starlim-system-test-{TIMESTAMP}'
    (REPORTS/f'{report_base}.md').write_text(md, encoding='utf-8')
    (REPORTS/f'{report_base}.json').write_text(json.dumps({'global_status': global_status, 'counts': counts, 'results': [asdict(r) for r in results]}, indent=2, ensure_ascii=False), encoding='utf-8')
    print('========================================')
    print('STARLIM SYSTEM TEST')
    print(f'Resultado: {global_status}')
    print(f'PASS: {counts["PASS"]}')
    print(f'FAIL: {counts["FAIL"]}')
    print(f'BLOCKED: {counts["BLOCKED"]}')
    print(f'WARNING: {counts["WARNING"]}')
    print(f'Reporte: reports/{report_base}.md')
    print('========================================')
    return 1 if counts['FAIL'] else (2 if counts['BLOCKED'] else 0)

if __name__ == '__main__':
    raise SystemExit(main())



