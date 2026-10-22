import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modulePage = readFileSync(new URL("../src/components/module-page.tsx", import.meta.url), "utf8");
const mobileNav = readFileSync(new URL("../src/components/seller-mobile-navigation.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("el modo móvil comercial se activa únicamente para vendedores", () => {
  assert.match(modulePage, /normalizeRole\(session\.role\) === "vendedor"/);
  assert.match(modulePage, /section\.label === "Inicio" \|\| section\.label === "Motor de ventas"/);
  assert.match(modulePage, /group\.active === "supervisor-lab"/);
  assert.match(modulePage, /<SellerMobileNavigation/);
});

test("la barra inferior expone Motor de ventas y destinos canónicos del ERP", () => {
  for (const href of ["/sales-engine", "/customers", "/quotes", "/prices"]) {
    assert.match(mobileNav, new RegExp(`href: "${href.replaceAll("/", "\\/")}"`));
  }
  assert.doesNotMatch(mobileNav, /href: "\/crm\//);
  assert.doesNotMatch(mobileNav, /Crear lead/);
  assert.match(mobileNav, /seller-mobile-navigation__create-slot/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /grid-template-columns: repeat\(5/);
});

const salesEngine = readFileSync(new URL("../src/app/sales-engine/page.tsx", import.meta.url), "utf8");
const crmSource = readFileSync(new URL("../src/lib/crm.ts", import.meta.url), "utf8");

test("el Motor de ventas muestra misiones explicadas con métricas reales", () => {
  assert.match(salesEngine, /Qué conviene hacer hoy/);
  assert.match(salesEngine, /Presupuestos accionables/);
  assert.match(salesEngine, /Recontactos sugeridos/);
  assert.match(salesEngine, /Cómo decide el motor/);
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
