import unittest
from urllib import request, error

BASE_URL = 'https://star-lim-phi.vercel.app'

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class ProductionCookieHeaderTests(unittest.TestCase):
    def test_production_session_cookie_has_security_flags(self):
        opener = request.build_opener(NoRedirect)
        req = request.Request(BASE_URL + '/frontend/panel_empleados.php', headers={'User-Agent': 'StarlimSecurityRegression/1.0'})
        try:
            with opener.open(req, timeout=12) as res:
                headers = dict(res.headers)
        except error.HTTPError as exc:
            headers = dict(exc.headers)
        lower_headers = {str(k).lower(): str(v) for k, v in headers.items()}
        if 'x-vercel-mitigated' in lower_headers or 'x-vercel-challenge-token' in lower_headers:
            self.skipTest('Vercel Firewall/Challenge mitigated the automated request; cookie flags cannot be verified from this response')
        cookie = headers.get('Set-Cookie', '')
        missing = [flag for flag in ['Secure', 'HttpOnly', 'SameSite'] if flag.lower() not in cookie.lower()]
        self.assertEqual([], missing, 'Missing cookie flags in production; deploy local session hardening and retest')

if __name__ == '__main__':
    unittest.main()
