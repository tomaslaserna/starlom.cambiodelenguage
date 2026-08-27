import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modulePage = readFileSync(new URL("../src/components/module-page.tsx", import.meta.url), "utf8");
const mobileNav = readFileSync(new URL("../src/components/seller-mobile-navigation.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("el modo móvil comercial se activa únicamente para vendedores", () => {
  assert.match(modulePage, /normalizeRole\(session\.role\) === "vendedor"/);
  assert.match(modulePage, /section\.label === "Inicio" \|\| section\.label === "CRM"/);
  assert.match(modulePage, /group\.active === "supervisor-lab"/);
  assert.match(modulePage, /<SellerMobileNavigation/);
});

test("la barra inferior expone Inicio y los destinos principales del CRM", () => {
  for (const href of ["/crm/perfil", "/crm/clientes", "/crm/presupuestos", "/crm/listas"]) {
    assert.match(mobileNav, new RegExp(`href: "${href.replaceAll("/", "\\/")}"`));
  }
  assert.doesNotMatch(mobileNav, /href: "\/crm\/leads", label: "Leads"/);
  assert.match(mobileNav, /href: "\/crm\/leads\?nuevo=1"/);
  assert.match(mobileNav, /seller-mobile-navigation__create-slot/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /grid-template-columns: repeat\(5/);
});

const crmProfile = readFileSync(new URL("../src/app/crm/perfil/page.tsx", import.meta.url), "utf8");
const crmSource = readFileSync(new URL("../src/lib/crm.ts", import.meta.url), "utf8");

test("el inicio CRM muestra el tablero comercial solicitado con métricas reales", () => {
  assert.match(crmProfile, /Ventas vs meta/);
  assert.match(crmProfile, /Presupuestos a revisar/);
  assert.match(crmProfile, /Clientes a cobrar/);
  assert.match(crmProfile, /Contactos pendientes hoy/);
  assert.match(crmProfile, /Top 5 clientes del mes/);
  assert.match(crmProfile, /normalizeRole\(session\.role\) !== "vendedor"/);
  assert.match(crmSource, /FROM vendor_goals/);
  assert.match(crmSource, /LIMIT 5/);
});

const supervisorChat = readFileSync(new URL("../src/app/supervisor-lab/supervisor-chat.tsx", import.meta.url), "utf8");
const message = readFileSync(new URL("../src/components/ai-elements/message.tsx", import.meta.url), "utf8");

test("el Supervisor evita cortes horizontales y mantiene el chat utilizable en móvil", () => {
  assert.match(supervisorChat, /overflow-x-hidden/);
  assert.match(supervisorChat, /max-w-full sm:max-w-\[92%\]/);
  assert.match(supervisorChat, /grid-rows-\[minmax\(0,1fr\)_auto\]/);
  assert.match(message, /\[&_table\]:overflow-x-auto/);
  assert.match(message, /\[&_pre\]:overflow-x-auto/);
});
