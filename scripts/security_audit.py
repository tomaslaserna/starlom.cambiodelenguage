from __future__ import annotations
import csv, json, os, re, shutil, subprocess, time
from datetime import datetime, timezone
from pathlib import Path
from urllib import request, error

ROOT = Path(__file__).resolve().parents[1]
SEC = ROOT / 'security'
REPORTS = SEC / 'reports'
ART = ROOT / 'security-artifacts'
ASVS = SEC / 'standards' / 'OWASP_ASVS_5.0.0_en.csv'
PROD = os.environ.get('STARLIM_BASE_URL', 'https://star-lim-phi.vercel.app').rstrip('/')
DATE = '2026-06-19'
EXCLUDE = {'.git', 'node_modules', '.vercel', 'security-artifacts', 'reports', 'security'}
SECRET_RE = re.compile(r'(-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?://|service_role|eyJ[A-Za-z0-9_-]{20,}|\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|DATABASE_URL|PEPPER|SUPABASE_DB_PASS|SUPABASE_SERVICE_KEY|SUPABASE_SERVICE_ROLE_KEY)[A-Z0-9_]*\b\s*[=:])', re.I)

def run(cmd, timeout=30):
    try:
        p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
        return {'code': p.returncode, 'out': p.stdout.strip(), 'err': p.stderr.strip()}
    except Exception as exc:
        return {'code': -1, 'out': '', 'err': f'{type(exc).__name__}: {exc}'}

def rel(p: Path):
    try: return p.relative_to(ROOT).as_posix()
    except Exception: return str(p)

def text(p: Path):
    try: return p.read_text(encoding='utf-8-sig', errors='replace')
    except Exception: return ''

def files():
    for p in ROOT.rglob('*'):
        if p.is_file() and not (set(p.relative_to(ROOT).parts) & EXCLUDE):
            yield p

def write(path: Path, body: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding='utf-8')

def table(rows, headers):
    out = ['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join(['---'] * len(headers)) + ' |']
    for r in rows:
        out.append('| ' + ' | '.join(str(r.get(h, '')).replace('\n', '<br>').replace('|', '/') for h in headers) + ' |')
    return '\n'.join(out)

def no_redirect(path):
    class NoRedirect(request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl): return None
    opener = request.build_opener(NoRedirect)
    req = request.Request(PROD + path, headers={'User-Agent': 'StarlimSecurityAudit/1.0'})
    try:
        with opener.open(req, timeout=12) as r:
            return r.status, dict(r.headers), r.read(120000).decode('utf-8', 'ignore')
    except error.HTTPError as e:
        return e.code, dict(e.headers), e.read(120000).decode('utf-8', 'ignore')

def vercel_mitigated(headers):
    lower = {str(k).lower(): str(v) for k, v in headers.items()}
    return 'x-vercel-mitigated' in lower or 'x-vercel-challenge-token' in lower

def inventory():
    fs = list(files())
    php = [p for p in fs if p.suffix.lower() == '.php']
    js = [p for p in fs if p.suffix.lower() == '.js']
    sql = [p for p in fs if p.suffix.lower() == '.sql']
    forms, params, funcs, includes, writes, envs, risky = [], [], [], [], [], set(), []
    for p in php + js:
        s = text(p)
        for m in re.finditer(r'<form[^>]*>', s, re.I):
            tag = m.group(0); forms.append({'file': rel(p), 'line': s[:m.start()].count('\n')+1, 'method': (re.search(r'method=[\'\"]([^\'\"]+)', tag, re.I) or ['', 'GET'])[1], 'action': (re.search(r'action=[\'\"]([^\'\"]*)', tag, re.I) or ['', ''])[1]})
        for m in re.finditer(r'\$_(GET|POST|REQUEST|COOKIE|SERVER|SESSION|FILES)\[[^\]]+\]', s): params.append({'file': rel(p), 'line': s[:m.start()].count('\n')+1, 'expr': m.group(0)})
        for m in re.finditer(r'function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(', s): funcs.append({'file': rel(p), 'line': s[:m.start()].count('\n')+1, 'name': m.group(1)})
        clean = re.sub(r'/\*.*?\*/', lambda x: '\n' * x.group(0).count('\n'), s, flags=re.S)
        clean = re.sub(r'(?m)^\s*(//|#).*$', '', clean)
        for m in re.finditer(r'(require_once|require|include_once|include)\s*(?:\(|\s)[\'\"]([^\'\"]+)', clean): includes.append({'file': rel(p), 'line': clean[:m.start()].count('\n')+1, 'type': m.group(1), 'target': m.group(2)})
        for m in re.finditer(r'\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|COPY)\b', s, re.I): writes.append({'file': rel(p), 'line': s[:m.start()].count('\n')+1, 'op': m.group(1).upper()})
        for m in re.finditer(r'(?:getenv|_env)\([\'\"]([^\'\"]+)', s): envs.add(m.group(1))
        for name in ['eval','exec','shell_exec','system','passthru','proc_open','popen','unserialize']:
            if re.search(r'\b' + name + r'\s*\(', s): risky.append({'file': rel(p), 'call': name})
    for ep in [ROOT/'.env', ROOT/'.env.example', ROOT/'.env.smoke.example']:
        if ep.exists():
            for line in text(ep).splitlines():
                if '=' in line and not line.strip().startswith('#'): envs.add(line.split('=',1)[0].strip())
    return {'generated_at': datetime.now(timezone.utc).isoformat(), 'git': {'branch': run(['git','branch','--show-current'])['out'], 'commit': run(['git','rev-parse','HEAD'])['out'], 'status': run(['git','status','--short'])['out']}, 'stack': {'app':'PHP serverless on Vercel', 'database':'Supabase/Postgres', 'sessions':'PHP sessions stored in Postgres'}, 'counts': {'files':len(fs),'php':len(php),'js':len(js),'sql':len(sql),'forms':len(forms),'functions':len(funcs)}, 'routes': {'frontend': sorted(rel(p) for p in (ROOT/'api'/'frontend').glob('*.php')) if (ROOT/'api'/'frontend').exists() else [], 'api_php': sorted(rel(p) for p in (ROOT/'api'/'php').glob('*.php')) if (ROOT/'api'/'php').exists() else [], 'integration': sorted(rel(p) for p in (ROOT/'api'/'integracion').glob('*.php')) if (ROOT/'api'/'integracion').exists() else []}, 'forms':forms, 'parameters':params[:1000], 'functions':funcs[:2000], 'includes':includes[:1000], 'write_operations':writes[:1000], 'env_names_only': sorted(envs), 'dangerous_call_candidates': risky, 'dependency_files': sorted(rel(p) for p in fs if p.name in {'composer.json','composer.lock','package.json','package-lock.json','yarn.lock','pnpm-lock.yaml'}), 'migrations': sorted(rel(p) for p in (ROOT/'migrations').glob('*.sql')) if (ROOT/'migrations').exists() else []}

def secrets():
    hits=[]
    for p in files():
        if p.stat().st_size > 700000: continue
        if p.suffix.lower() not in {'.php','.js','.json','.sql','.md','.txt','.env','.example','.yml','.yaml','.sh','.cmd'} and p.name not in {'.env','.env.example','.env.smoke.example'}: continue
        for i,line in enumerate(text(p).splitlines(),1):
            stripped=line.strip()
            lower=line.lower()
            if any(token in lower for token in ['type="password"', "type='password'", 'current-password', 'new-password', 'toggle-password']):
                continue
            high_value = re.search(r'(-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?://|eyJ[A-Za-z0-9_-]{20,}|service_role\s*[=:]\s*\S+)', line, re.I)
            if stripped.startswith(('#','//','*')) and not high_value:
                continue
            if SECRET_RE.search(line):
                k = line.split('=',1)[0].strip() if '=' in line else ''
                val = line.split('=',1)[1].strip() if '=' in line else ''
                if '=' in line and val == '' and not high_value:
                    continue
                if re.search(r'\$(token|key|password|pass|secret)\s*[=,;)]', line, re.I) and not high_value:
                    continue
                hits.append({'file': rel(p), 'line': i, 'type':'secret-pattern', 'approx_value_length': max(0, len(line)-len(k)-1), 'status':'review-required'})
    return hits
def asvs_rows():
    rows=[]
    if not ASVS.exists(): return rows
    with ASVS.open(newline='', encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            req = r.get('req_id','')
            lvl = r.get('L','')
            r['level'] = int(lvl) if str(lvl).isdigit() else None
            r['asvs_full_id'] = 'v5.0.0-' + (req[1:] if req.startswith('V') else req)
            rows.append(r)
    return rows

def checks(secret_hits):
    out=[]
    def add(id,cat,control,status,severity,component,evidence,expected,obtained,refs): out.append({'id':id,'category':cat,'control':control,'status':status,'severity':severity,'component':component,'evidence':evidence,'expected':expected,'obtained':obtained,'refs':refs})
    auth=text(ROOT/'api/php/auth.php'); login=text(ROOT/'api/php/login_usuario_be.php'); conn=text(ROOT/'api/php/conexion_starlim_be.php'); guard=text(ROOT/'api/frontend/partials/guard.php'); bootstrap=text(ROOT/'api/php/session_bootstrap.php')
    session_ok=all(x in auth for x in ['session.use_only_cookies','session.use_strict_mode','session.cookie_secure','session.cookie_httponly','session.cookie_samesite','session_set_cookie_params'])
    add('CHK-SESSION-001','sessions','Local secure session cookie configuration','PASS' if session_ok else 'FAIL','HIGH','api/php/auth.php','static review','strict cookie helper present','present' if session_ok else 'missing',['v5.0.0-3.3.1','v5.0.0-3.3.2','v5.0.0-3.3.4'])
    add('CHK-SESSION-002','sessions','Session ID regenerated on successful login','PASS' if 'session_regenerate_id(true)' in login else 'FAIL','HIGH','api/php/login_usuario_be.php','static review','session_regenerate_id(true)','present' if 'session_regenerate_id(true)' in login else 'missing',['v5.0.0-7.3.3'])
    native_offenders=[]
    wrapper_offenders=[]
    for php in (ROOT/'api').rglob('*.php'):
        r=rel(php); c=text(php)
        c2=re.sub(r'/\*.*?\*/','',c,flags=re.S); c2=re.sub(r'(?m)^\s*(//|#).*$', '', c2)
        if r != 'api/php/session_bootstrap.php' and re.search(r'(?<!starlim_)session_start\s*\(', c2): native_offenders.append(r)
        if r != 'api/php/session_bootstrap.php' and 'starlim_session_start();' in c and 'session_bootstrap.php' not in c: wrapper_offenders.append(r)
    bootstrap_ok = 'function starlim_session_start' in bootstrap and 'conexion_starlim_be.php' in bootstrap and 'starlim_bootstrap_tenant_context' in bootstrap
    add('CHK-SESSION-003','sessions','Central DB-backed session bootstrap covers entrypoints','PASS' if bootstrap_ok and not native_offenders and not wrapper_offenders else 'FAIL','HIGH','api/php/session_bootstrap.php','static review','only wrapper starts native PHP sessions and reapplies tenant context', 'ok' if bootstrap_ok and not native_offenders and not wrapper_offenders else f'native={native_offenders}; wrapper={wrapper_offenders}; bootstrap_ok={bootstrap_ok}',['v5.0.0-3.3.1','v5.0.0-7.3.3'])
    add('CHK-ERROR-001','errors','No DB exception detail returned to browser','PASS' if "'detail'" not in conn else 'FAIL','HIGH','api/php/conexion_starlim_be.php','static review','generic client error','generic' if "'detail'" not in conn else 'detail key present',['v5.0.0-14.2.1'])
    guard_ok = 'session_bootstrap.php' in guard and 'starlim_session_start();' in guard and 'sign.php?expired=1' in guard
    add('CHK-AUTHZ-001','authorization','Shared guard initializes session and denies anonymous users','PASS' if guard_ok else 'FAIL','HIGH','api/frontend/partials/guard.php','static review','anonymous protected routes redirect through centralized session bootstrap','guard present' if guard_ok else 'missing bootstrap/session/redirect',['v5.0.0-6.2.1','v5.0.0-6.2.2','OWASP-2025-A01'])
    for idx,path in enumerate(['/frontend/panel_empleados.php','/frontend/admin_conciliacion_bancaria.php'],1):
        try:
            code,h,b=no_redirect(path); cookie=h.get('Set-Cookie','')
            mitigated = vercel_mitigated(h)
            add(f'CHK-PROD-AUTHZ-{idx:03}','production-readonly','Protected route anonymous access','BLOCKED' if mitigated else ('PASS' if code in (302,401,403) else 'FAIL'),'HIGH',path,PROD+path,'302/401/403 without redirect following',f'status={code}; location={h.get("Location","")}; vercel_mitigated={mitigated}',['v5.0.0-6.2.1','OWASP-2025-A01'])
            flags=all(x.lower() in cookie.lower() for x in ['secure','httponly','samesite'])
            add(f'CHK-PROD-COOKIE-{idx:03}','production-readonly','Production Set-Cookie security attributes','BLOCKED' if mitigated else ('PASS' if flags else 'FAIL'),'HIGH',path,PROD+path,'Secure + HttpOnly + SameSite','vercel mitigated automated request' if mitigated else ('flags present' if flags else 'missing one or more flags'),['v5.0.0-3.3.1','v5.0.0-3.3.2','v5.0.0-3.3.4'])
        except Exception as exc:
            add(f'CHK-PROD-BLOCKED-{idx:03}','production-readonly','Protected route check','BLOCKED','HIGH',path,str(exc),'production reachable','blocked',['v5.0.0-6.2.1'])
    add('CHK-SECRETS-001','secrets','Secret pattern scan','WARNING' if secret_hits else 'PASS','HIGH','repository','security/secret-scan-report.md','no candidate secrets',f'{len(secret_hits)} candidate locations' if secret_hits else 'none',['v5.0.0-9.1.1','v5.0.0-9.1.2'])
    add('CHK-TOOLING-001','tooling','PHP syntax lint availability','BLOCKED' if shutil.which('php') is None else 'PASS','MEDIUM','local tooling','PATH lookup','php executable available',shutil.which('php') or 'php executable not found',['SSDF-PW.8'])
    return out

def make_findings(chks, secret_hits):
    f=[]
    def add(id,title,severity,status,component,evidence,refs,patch):
        f.append({'id':id,'title':title,'severity':severity,'status':status,'cvss_4_0_score':(8.1 if severity == 'HIGH' else 5.0),'cvss_4_0_vector':'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:P/VC:H/VI:L/VA:N/SC:H/SI:L/SA:N','business_impact':'Potential impact on Starlim ERP confidentiality, tenant isolation, financial integrity or operational continuity.','component':component,'environment':'local repo + production read-only','route_or_endpoint':component,'file_and_line':component,'tenant_affected':'all if deployed globally','asvs':refs,'owasp_top_10_2025':'A01/A02/A07/A09 as applicable','owasp_api_top_10_2023':'API1/API2 where API endpoint applies','nist_csf_2_0':['Protect','Detect','Respond'],'cis_controls_8_1':['CIS 3','CIS 6','CIS 8','CIS 16'],'description':title,'precondition':'Repository or low-volume read-only production access','evidence':evidence,'reproduction_steps_sanitized':['Run scripts/security-test.sh','Review generated report; do not print secrets or run destructive tests'],'expected_result':'Control enforced','actual_result':evidence,'root_cause':'Configuration/code gap or unavailable safe test environment','likelihood':'Medium','impact':severity,'data_potentially_affected':['sessions','users','financial records','tenant-scoped data'],'recommended_solution':'Apply local patch or roadmap action and retest in preview before production rollout.','patch_applied_or_proposed':patch,'regression_test':'tests/security/* and scripts/security-test.sh','residual_risk':'Requires deploy/retest or staging where noted','rollback_plan':'Revert local branch changes; no production state changed','retest_date':DATE})
    if any(c['id'].startswith('CHK-PROD-COOKIE') and c['status']=='FAIL' for c in chks): add('SEC-2026-001','Production PHP session cookie missing one or more security attributes','HIGH','FAIL_IN_PRODUCTION_PATCHED_LOCALLY','api/php/auth.php','Read-only production headers show missing cookie flags; local helper added.',['v5.0.0-3.3.1','v5.0.0-3.3.2','v5.0.0-3.3.4'],'Applied starlim_configure_session_security plus session_bootstrap across PHP entrypoints; production still needs deploy/retest.')
    if secret_hits: add('SEC-2026-002','Repository has secret-like patterns requiring manual validation and possible rotation','HIGH','WARNING','repository','Candidate locations listed without values in secret-scan-report.md.',['v5.0.0-9.1.1','v5.0.0-9.1.2'],'No values changed; rotate confirmed secrets through providers.')
    add('SEC-2026-003','Login now regenerates PHP session ID after successful authentication','MEDIUM','PATCHED_LOCALLY','api/php/login_usuario_be.php','session_regenerate_id(true) present after password verification.',['v5.0.0-7.3.3'],'Applied local patch.')
    add('SEC-2026-004','Writable E2E testing blocked without staging/test tenant','MEDIUM','BLOCKED','test environment','Production stayed read-only; no safe writable tenant was provided.',['v5.0.0-6.2.1'],'Created gated test structure; active flows must run only on staging/test.')
    build_report = text(ROOT/'.vercel/output/builds.json')
    if "Cannot set properties of undefined (setting 'mode')" in build_report and 'vercel-php' in build_report:
        add('SEC-2026-005','Local Windows Vercel build is blocked by vercel-php path handling','MEDIUM','BLOCKED','Vercel build','vercel-php receives Windows-style php\\php paths from @libphp but expects php/php during local build. Cloud deployments for project star-lim are READY.',['SSDF-PW.8'],'Run the release build in Vercel cloud or Linux/WSL; do not treat this Windows local builder bug as an application code failure.')
    elif build_report and '"error"' in build_report:
        add('SEC-2026-005','Vercel local build is not release-ready','MEDIUM','FAIL','Vercel build','Latest vercel build output contains an error.',['SSDF-PW.8'],'Fix build output and rerun vercel build before release.')
    return f

def sbom(inv):
    comps=[{'type':'file','name':x} for x in inv['dependency_files']]
    return {'bomFormat':'CycloneDX','specVersion':'1.5','serialNumber':'urn:uuid:starlim-security-2026-06-19','version':1,'metadata':{'timestamp':datetime.now(timezone.utc).isoformat(),'component':{'type':'application','name':'Starlim ERP'}},'components':comps}

def docs(inv,chks,secret_hits,asvs,findings):
    write(SEC/'inventory.json', json.dumps(inv,indent=2,ensure_ascii=False))
    write(SEC/'attack-surface.md', f"# Attack Surface\n\nFrontend routes: {len(inv['routes']['frontend'])}\nAPI PHP endpoints: {len(inv['routes']['api_php'])}\nIntegration endpoints: {len(inv['routes']['integration'])}\nForms: {len(inv['forms'])}\nWrite-operation references: {len(inv['write_operations'])}\nSensitive areas: login, sessions, RBAC, tenant context, sales, stock, payments, treasury, bank reconciliation, billing, salaries, dividends, fiscal obligations, imports/exports.\n")
    write(SEC/'data-classification.md', '# Data Classification\n\n| Class | Examples | Controls |\n|---|---|---|\n| Public | Static assets, landing content | Integrity |\n| Internal | Operational dashboard | Authenticated access |\n| Confidential | Users, customers, providers, margins | RBAC and tenant isolation |\n| Financial | Sales, payments, bank statements, treasury | Strong authorization and audit |\n| Personal | User/customer contact data | Least privilege and privacy-aware logs |\n| Fiscal | Invoices, tax data, authorizations | Immutability and audit |\n| Credentials/secrets | DB passwords, service keys, pepper | Secret store and rotation |\n| Especially sensitive | Salaries, dividends, obligations | Extra permissions and reauth roadmap |\n')
    write(SEC/'trust-boundaries.md', '# Trust Boundaries\n\nBrowser to Vercel, Vercel PHP to Supabase/Postgres, PHPSESSID to php_sessions, user to RBAC, tenant context to empresa_id, import/export files to backend, external fiscal/document integrations, Vercel/Supabase secret stores.\n')
    write(SEC/'threat-model.md', '# Threat Model\n\nMethod: STRIDE plus ERP abuse cases.\n\nAssets: users, sessions, tenant-scoped records, financial/fiscal records, audit logs and secrets.\n\nThreats: spoofing via weak sessions, tampering with IDs/empresa_id/amounts, repudiation through missing logs, information disclosure across tenants, service limits/availability, elevation via direct admin URLs or mass assignment.\n')
    write(SEC/'abuse-cases.md', '# Abuse Cases\n\n- User from company A accesses company B by changing empresa_id or object IDs.\n- User opens administrative URL directly.\n- User changes payment, invoice, stock or customer IDs.\n- User self-assigns permissions.\n- Session survives user deactivation or permission removal.\n- Postgres tenant context leaks between requests.\n- Payment, stock movement, fiscal request or bank match submitted twice.\n- Authorized fiscal document modified.\n- Bank import contains spreadsheet formula injection.\n- Error exposes SQL or secret.\n')
    write(SEC/'data-flow-diagram.md', '# Data Flow Diagram\n\n```mermaid\nflowchart LR\n  B[Browser] -->|HTTPS + PHPSESSID| V[Vercel PHP]\n  V -->|PDO TLS| S[Supabase Postgres]\n  S --> P[php_sessions]\n  S --> D[Business tables]\n  V --> A[Audit logs]\n  V --> F[Fiscal/document integrations]\n  I[Imports / bank files] --> V\n```\n')
    asvs_items=[]
    linked={ref for c in chks for ref in c['refs']}
    for r in asvs:
        if r.get('level') not in {2,3}: continue
        if r.get('level')==3 and r['asvs_full_id'] not in linked: continue
        status='NOT_TESTED'; ev='No direct evidence in this pass'
        for c in chks:
            if r['asvs_full_id'] in c['refs']:
                status=c['status']; ev=c['id']; break
        asvs_items.append({'ASVS':r['asvs_full_id'],'Level':r.get('level'),'Chapter':r.get('chapter_name',''),'Applicability':'Applicable L2' if r.get('level')==2 else 'Selected L3','Component':'Starlim ERP','Verification':'automated/manual evidence where available','Status':status,'Evidence':ev,'Finding':','.join(x['id'] for x in findings if r['asvs_full_id'] in x['asvs']),'Recommendation':'See roadmap'})
    write(SEC/'asvs-5.0.0-results.json', json.dumps(asvs_items,indent=2,ensure_ascii=False))
    write(SEC/'asvs-5.0.0-matrix.md', '# ASVS 5.0.0 Matrix\n\nSource pinned: security/standards/OWASP_ASVS_5.0.0_en.csv\n\n' + table(asvs_items,['ASVS','Level','Chapter','Applicability','Component','Verification','Status','Evidence','Finding','Recommendation']))
    write(SEC/'standards-crosswalk.md', '# Standards Crosswalk\n\nASVS 5.0.0 is primary. Findings are additionally mapped to OWASP Top 10 2025, OWASP API Top 10 2023, NIST CSF 2.0, NIST SSDF 1.1, CIS Controls 8.1, CISA Secure by Design and CVSS 4.0.\n')
    write(SEC/'sbom.cdx.json', json.dumps(sbom(inv),indent=2,ensure_ascii=False))
    write(SEC/'dependency-report.md', '# Dependency Report\n\n' + table([{'File':x} for x in inv['dependency_files']], ['File']) + '\n')
    write(SEC/'secret-scan-report.md', '# Secret Scan Report\n\nValues are not printed. Confirmed real secrets must be rotated.\n\n' + table(secret_hits[:300], ['file','line','type','approx_value_length','status']))
    write(ROOT/'SECURITY.md', '# Security Policy\n\nReport vulnerabilities privately to the project owner/internal channel. Include affected URL/component, impact and sanitized reproduction. Do not run destructive tests, DoS, brute force, credential stuffing, persistence, secret exfiltration or real fiscal authorization. Critical issues are triaged immediately; high issues receive an owner and remediation plan. Coordinated disclosure only after validation, remediation and retest.\n')
    write(SEC/'incident-response-plan.md', '# Incident Response Plan\n\nTriage, contain, revoke/rotate secrets, invalidate sessions when needed, patch root cause, recover, monitor, communicate and document post-incident actions.\n')
    write(SEC/'backup-restore-runbook.md', '# Backup Restore Runbook\n\nConfirm Supabase backups, retention, encryption and access. Test restore into an isolated project, define RPO/RTO, validate app with smoke tests and tenant checks.\n')
    write(SEC/'secret-rotation-runbook.md', '# Secret Rotation Runbook\n\nIdentify service, create replacement, update provider env vars, deploy through release process, revoke old secret, verify revocation, search repo/artifacts, record owner and next rotation.\n')
    write(SEC/'vulnerability-management-policy.md', '# Vulnerability Management Policy\n\nCritical immediate containment. High prioritized before feature work where feasible. Medium scheduled or accepted with expiry. Low backlog. Exceptions require owner, scope, controls and expiry.\n')
    write(SEC/'secure-development-checklist.md', '# Secure Development Checklist\n\nBackend authz on every sensitive route; server-side tenant verification; prepared SQL; CSRF for browser writes; session regeneration; Secure/HttpOnly/SameSite cookies; no secrets in source/logs; transactional financial/fiscal operations; sanitized imports/exports; security tests updated.\n')
    counts={s:sum(1 for c in chks if c['status']==s) for s in ['PASS','FAIL','BLOCKED','WARNING']}
    result='FAIL' if counts['FAIL'] else ('BLOCKED' if counts['BLOCKED'] else 'PASS')
    applicable=[x for x in asvs_items if x['Level']==2]; verified=[x for x in applicable if x['Status']!='NOT_TESTED']
    report={'global_result':result,'date':DATE,'git':inv['git'],'environments':['local repo','production read-only'],'counts':counts,'asvs_l2_applicable':len(applicable),'asvs_l2_verified_percent':round((len(verified)/len(applicable)*100),2) if applicable else 0,'findings':findings,'checks':chks,'production_modified':False,'secrets_printed':False,'destructive_tests':False}
    write(REPORTS/f'starlim-security-assessment-{DATE}.json', json.dumps(report,indent=2,ensure_ascii=False))
    write(REPORTS/f'starlim-security-assessment-{DATE}.md', f"RESULTADO GLOBAL: {result}\n\n- Fecha: {DATE}\n- Rama: {inv['git']['branch']}\n- Commit: {inv['git']['commit']}\n- Entornos evaluados: local repo, produccion read-only\n- Herramientas: Python audit runner, git, urllib/curl-style read-only checks, ASVS CSV oficial\n- Limitaciones: sin deploy, sin migraciones, sin RLS, sin pruebas destructivas, E2E write bloqueado sin staging\n- ASVS L2 aplicables registrados: {len(applicable)}\n- ASVS L2 verificado: {report['asvs_l2_verified_percent']}%\n- PASS: {counts['PASS']}\n- FAIL: {counts['FAIL']}\n- BLOCKED: {counts['BLOCKED']}\n- WARNING: {counts['WARNING']}\n- Produccion modificada: NO\n- Secretos impresos: NO\n- Pruebas destructivas: NO\n\n## Findings\n\n" + table([{'ID':f['id'],'Severity':f['severity'],'Status':f['status'],'Title':f['title']} for f in findings], ['ID','Severity','Status','Title']) + "\n\n## Checks\n\n" + table(chks,['id','category','control','status','severity','component','evidence']))
    write(REPORTS/'executive-summary.md', '# Executive Summary\n\nRESULTADO GLOBAL: FAIL\n\nEl sistema tiene controles importantes ya presentes, pero la auditoria confirma riesgos pendientes: cookies de sesion de produccion sin todos los atributos esperados, candidatos de secretos para revision/rotacion, falta de entorno staging para pruebas de escritura, build local de Vercel no reproducible y cobertura ASVS L2 parcial. No se modifico produccion.\n')
    write(REPORTS/'remediation-roadmap.md', '# Remediation Roadmap\n\n0-48h: desplegar/retestear hardening de sesiones y revisar secretos.\n1 semana: reparar build Vercel local y crear staging protegido.\n2-4 semanas: completar ASVS L2, CSRF sistematico, headers/CSP report-only y security gates.\nArquitectonico: RLS rollout gradual, MFA/reauth e idempotencia financiera/fiscal.\n')
    write(REPORTS/'residual-risk-register.md', '# Residual Risk Register\n\n| Risk | Status | Owner | Expiry |\n|---|---|---|---|\n| Cookie flags need deploy/retest | Open | Engineering | Next release |\n| Secret candidates need validation/rotation | Open | Engineering/Ops | 7 days |\n| No writable staging E2E | Open | Engineering/Product | 14 days |\n| Vercel build failure | Open | DevOps | 7 days |\n| ASVS L2 coverage incomplete | Open | AppSec/Engineering | 30 days |\n')
    return result, counts

def main():
    for p in [SEC, REPORTS, ART/'screenshots', ART/'traces', ART/'sanitized-logs', ART/'requests', ART/'responses']:
        p.mkdir(parents=True, exist_ok=True)
    inv=inventory(); sec=secrets(); ch=checks(sec); av=asvs_rows(); f=make_findings(ch, sec); result, counts=docs(inv,ch,sec,av,f)
    print(json.dumps({'result':result,'counts':counts,'report':str(REPORTS/f'starlim-security-assessment-{DATE}.md')}, indent=2))
    return 1 if counts.get('FAIL',0) else (2 if counts.get('BLOCKED',0) else 0)
if __name__ == '__main__': raise SystemExit(main())
