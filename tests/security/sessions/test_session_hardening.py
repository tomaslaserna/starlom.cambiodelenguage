import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

class SessionHardeningTests(unittest.TestCase):
    def test_session_cookie_helper_sets_required_flags(self):
        auth = (ROOT / 'api' / 'php' / 'auth.php').read_text(encoding='utf-8', errors='replace')
        for needle in ['session.use_only_cookies', 'session.use_strict_mode', 'session.cookie_secure', 'session.cookie_httponly', 'session.cookie_samesite', 'session_set_cookie_params']:
            self.assertIn(needle, auth)

    def test_login_regenerates_session_id_after_success(self):
        login = (ROOT / 'api' / 'php' / 'login_usuario_be.php').read_text(encoding='utf-8', errors='replace')
        self.assertIn('session_regenerate_id(true)', login)

    def test_php_files_touched_have_no_utf8_bom(self):
        for rel in ['api/php/auth.php', 'api/php/conexion_starlim_be.php', 'api/php/login_usuario_be.php', 'api/php/cerrar_sesion.php', 'api/frontend/partials/guard.php']:
            data = (ROOT / rel).read_bytes()
            self.assertFalse(data.startswith(b'\xef\xbb\xbf'), rel)

    def test_no_native_session_start_outside_bootstrap(self):
        allowed = {'api/php/session_bootstrap.php'}
        offenders = []
        for php in (ROOT / 'api').rglob('*.php'):
            rel = php.relative_to(ROOT).as_posix()
            content = php.read_text(encoding='utf-8', errors='replace')
            import re
            content_no_comments = re.sub(r'/\*.*?\*/', '', content, flags=re.S)
            content_no_comments = re.sub(r'(?m)^\s*(//|#).*$', '', content_no_comments)
            if rel not in allowed:
                native = re.search(r'(?<!starlim_)session_start\s*\(', content_no_comments)
                if native:
                    offenders.append(rel)
        self.assertEqual([], sorted(set(offenders)))

    def test_session_wrapper_users_include_bootstrap(self):
        offenders = []
        for php in (ROOT / 'api').rglob('*.php'):
            rel = php.relative_to(ROOT).as_posix()
            content = php.read_text(encoding='utf-8', errors='replace')
            if rel == 'api/php/session_bootstrap.php':
                continue
            if 'starlim_session_start();' in content and 'session_bootstrap.php' not in content:
                offenders.append(rel)
        self.assertEqual([], sorted(offenders))

if __name__ == '__main__':
    unittest.main()