import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("la navegación concentra el seguimiento en Motor de ventas", () => {
  const nav = read("../src/lib/navigation.ts");
  assert.match(nav, /href: "\/sales-engine", label: "Motor de ventas"/);
  const line = nav.split("\n").find((l) => l.includes('"/sales-engine"'));
  assert.match(line, /active: "sales-engine"/);
  assert.match(line, /CRM_READ_PERMISSION/);
  assert.doesNotMatch(nav, /href: "\/crm\/(perfil|clientes|leads|cobros|presupuestos)"/);
});

test("pagina /crm/cobros usa getVendorOpenAccounts (saldo corrido)", () => {
  const src = read("../src/app/crm/cobros/page.tsx");
  assert.match(src, /getVendorOpenAccounts/);
  assert.match(src, /sessionCanUseCrm/);
});

const crmCobrosPage = readFileSync(new URL("../src/app/crm/cobros/page.tsx", import.meta.url), "utf8");
test("crm/cobros muestra el boton Registrar cobro con el cliente pre-cargado", () => {
  assert.match(crmCobrosPage, /RegisterPaymentDialog/);
  assert.match(crmCobrosPage, /registerCrmCustomerPaymentAction/);
  assert.match(crmCobrosPage, /defaultCustomerId=\{[^}]*clientId[^}]*\}/);
});

test("pagina /crm/clientes es DB pura del vendedor: tabla, sin tablero ni tira de perfil", () => {
  const src = read("../src/app/crm/clientes/page.tsx");
  assert.match(src, /getVendorCustomers/);
  assert.match(src, /\/crm\/clientes\/\$\{/); // linkea a la ficha sin abandonar el CRM
  assert.match(src, /PaginationLinks/);
  assert.doesNotMatch(src, /ClientesDashboard/); // el seguimiento se movio a Perfil
  assert.doesNotMatch(src, /getVendorProfile/); // saca la tira de perfil
});

test("el seguimiento comercial vive en Motor de ventas y Perfil redirige", () => {
  const src = read("../src/app/sales-engine/page.tsx");
  const legacy = read("../src/app/crm/perfil/page.tsx");
  assert.match(src, /DailyMissions/);
  assert.match(src, /getVendorClients/);
  assert.match(src, /getVendorProfile/); // mantiene los numeros del vendedor
  assert.match(src, /sessionCanUseCrm\(session\)/);
  assert.match(legacy, /redirect\("\/sales-engine"\)/);
});

test("registerCrmCustomerPaymentAction: gate crm.ver + guard de propiedad + registerCustomerPayment", () => {
  const crmCobrosActions = read("../src/app/crm/cobros/actions.ts");
  assert.match(crmCobrosActions, /registerCrmCustomerPaymentAction/);
  assert.match(crmCobrosActions, /requireApiSession\(\[CRM_READ_PERMISSION\]\)/);
  assert.match(crmCobrosActions, /assertVendorOwnsClient/);
  assert.match(crmCobrosActions, /registerCustomerPayment/);
  assert.match(crmCobrosActions, /revalidatePath\("\/crm\/cobros"\)/);
  assert.match(crmCobrosActions, /revalidatePath\("\/admin\/approvals"\)/);
  // el flujo viejo por saleId queda retirado
  assert.doesNotMatch(crmCobrosActions, /registerCollection\b/);
  assert.doesNotMatch(crmCobrosActions, /assertVendorOwnsSale/);
});
