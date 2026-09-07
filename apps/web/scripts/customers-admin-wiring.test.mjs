import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeAuth = readFileSync(new URL("../src/lib/route-auth.ts", import.meta.url), "utf8");
const customersPage = readFileSync(new URL("../src/app/customers/page.tsx", import.meta.url), "utf8");
const newCustomerPage = readFileSync(new URL("../src/app/customers/new/page.tsx", import.meta.url), "utf8");
const customerActions = readFileSync(new URL("../src/app/customers/customer-row-actions.tsx", import.meta.url), "utf8");

test("el rol jefe tiene clientes.eliminar y vendedor no", () => {
  const jefeBlock = routeAuth.slice(routeAuth.indexOf("jefe:"), routeAuth.indexOf("deposito:"));
  const vendedorBlock = routeAuth.slice(routeAuth.indexOf("vendedor:"), routeAuth.length);
  assert.match(jefeBlock, /"clientes\.eliminar"/);
  assert.doesNotMatch(vendedorBlock, /"clientes\.eliminar"/);
});

test("alta y edición de clientes usan condiciones fiscales predeterminadas", () => {
  assert.match(newCustomerPage, /FISCAL_CONDITION_OPTIONS\.map/);
  assert.match(customerActions, /FISCAL_CONDITION_OPTIONS\.map/);
  assert.doesNotMatch(customerActions, /<Input[^>]+name="vatCondition"/);
});

test("el alta administrativa usa una pantalla dedicada y conserva la URL anterior", () => {
  assert.match(customersPage, /redirect\("\/customers\/new"\)/);
  assert.match(customersPage, /href=\{crmMode \? "\/crm\/clientes" : "\/customers\/new"\}/);
  assert.match(newCustomerPage, /action=\{createCustomerAction\}/);
  assert.match(newCustomerPage, /resource: "clientes", action: "crear"/);
  assert.match(newCustomerPage, /fastOr\(listPriceLists\(session\.companyId, true\), \[\], 500\)/);
});
