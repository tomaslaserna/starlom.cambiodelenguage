import unittest
from urllib import request, error

BASE_URL = 'https://star-lim-phi.vercel.app'

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class ProtectedRouteTests(unittest.TestCase):
    def fetch(self, path):
        opener = request.build_opener(NoRedirect)
        req = request.Request(BASE_URL + path, headers={'User-Agent': 'StarlimSecurityRegression/1.0'})
        try:
            with opener.open(req, timeout=12) as res:
                return res.status, dict(res.headers)
        except error.HTTPError as exc:
            return exc.code, dict(exc.headers)

    def test_protected_routes_redirect_anonymous_users(self):
        for path in ['/frontend/panel_empleados.php', '/frontend/admin_conciliacion_bancaria.php']:
            status, headers = self.fetch(path)
            self.assertIn(status, {302, 401, 403}, path)

if __name__ == '__main__':
    unittest.main()