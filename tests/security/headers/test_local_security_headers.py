import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

class LocalSecurityHeaderTests(unittest.TestCase):
    def test_security_headers_helper_defines_required_headers(self):
        source = (ROOT / 'api' / 'php' / 'security_headers.php').read_text(encoding='utf-8', errors='replace')
        for header in [
            'X-Content-Type-Options: nosniff',
            'X-Frame-Options: SAMEORIGIN',
            'Referrer-Policy: strict-origin-when-cross-origin',
            'Permissions-Policy:',
            'Content-Security-Policy-Report-Only:',
            'Cache-Control: no-store',
            'Pragma: no-cache',
        ]:
            self.assertIn(header, source)

    def test_session_bootstrap_applies_security_headers_before_session_start(self):
        source = (ROOT / 'api' / 'php' / 'session_bootstrap.php').read_text(encoding='utf-8', errors='replace')
        self.assertIn('security_headers.php', source)
        self.assertLess(source.index('starlim_apply_security_headers(true)'), source.index('session_start();'))

    def test_login_page_applies_public_security_headers(self):
        source = (ROOT / 'api' / 'frontend' / 'sign.php').read_text(encoding='utf-8', errors='replace')
        self.assertLess(source.index('starlim_apply_security_headers(false)'), source.index('<!DOCTYPE html>'))

if __name__ == '__main__':
    unittest.main()
