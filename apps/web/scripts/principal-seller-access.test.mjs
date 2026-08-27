import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("el vendedor principal recibe lectura ampliada sin permisos operativos", () => {
  const migration = read("../../../supabase/migrations/20260826195451_principal_seller_read_access.sql");
  assert.match(migration, /clientes\.ver_todos/);
  assert.match(migration, /ventas\.ver_solo_lectura/);
  assert.match(migration, /cobranzas\.ver_solo_lectura/);
  assert.doesNotMatch(migration, /ventas\.operar/);
  assert.doesNotMatch(migration, /pedidos\.editar/);
});

test("los alias de lectura habilitan páginas sin habilitar acciones", () => {
  const routeAuth = read("../src/lib/route-auth.ts");
  const salesPage = read("../src/app/sales/page.tsx");
  const fiscalAction = read("../src/app/sales/actions.ts");
  const adjustmentAction = read("../src/app/orders/new/adjustment-actions.ts");

  assert.match(routeAuth, /SALES_READ_ONLY_PERMISSION/);
  assert.match(routeAuth, /COLLECTIONS_READ_ONLY_PERMISSION/);
  assert.match(salesPage, /canOperateSales/);
  assert.match(fiscalAction, /requireApiSession\(\[SALES_OPERATE_PERMISSION\]\)/);
  assert.match(adjustmentAction, /requireApiSession\(\[SALES_OPERATE_PERMISSION\]\)/);
});
