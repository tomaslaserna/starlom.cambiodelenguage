import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const routeAuth = read("../src/lib/route-auth.ts");
const billingActions = read("../src/app/billing/actions.ts");
const fiscalNotePage = read("../src/app/billing/fiscal-note-page.tsx");
const approvals = read("../src/lib/approvals.ts");

test("un permiso individual explicito puede habilitar acciones sensibles", () => {
  assert.match(routeAuth, /JOIN app_permissions ap ON ap\.key = pp\.permission_key\s+WHERE pp\.profile_id/);
  assert.match(routeAuth, /JOIN app_permissions ap ON ap\.key = rp\.permission_key AND ap\.sensitive = FALSE/);
});

test("fiscal autoriza por permiso operativo y no por nombre de rango", () => {
  assert.doesNotMatch(billingActions, /Solo Administrador o Jefe/);
  assert.match(billingActions, /requireApiSession\(\[SALES_OPERATE_PERMISSION\]\)/);
  assert.match(fiscalNotePage, /sessionAllows\(session, \[SALES_OPERATE_PERMISSION\]\)/);
});

test("las aprobaciones generales se resuelven por bloque", () => {
  assert.match(approvals, /ORDERS_MANAGE_PERMISSION/);
  assert.match(approvals, /PURCHASES_APPROVE_PERMISSION/);
  assert.doesNotMatch(approvals, /role === "administrador"/);
});
