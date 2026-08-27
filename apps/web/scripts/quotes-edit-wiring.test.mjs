import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("actions expone updateQuoteAction y deleteQuoteAction con permisos correctos", () => {
  const src = read("../src/app/quotes/actions.ts");
  assert.match(src, /export async function updateQuoteAction/);
  assert.match(src, /export async function deleteQuoteAction/);
  assert.match(src, /updateQuote\(/);
  assert.match(src, /deleteQuote\(/);
  assert.match(src, /resource: "presupuestos", action: "editar"/);
  assert.match(src, /resource: "presupuestos", action: "cancelar"/);
  assert.match(src, /redirect\("\/quotes\?updated=1"\)/);
  assert.match(src, /redirect\("\/quotes\?deleted=1"\)/);
});

test("el rol jefe puede cancelar presupuestos", () => {
  const src = read("../src/lib/route-auth.ts");
  const jefeBlock = src.slice(src.indexOf("jefe: ["), src.indexOf("deposito:"));
  assert.match(jefeBlock, /"presupuestos\.cancelar"/);
});

test("QuoteEntryFields soporta modo edicion (initialValues, quoteId, boton Guardar)", () => {
  const src = read("../src/app/quotes/quote-entry-fields.tsx");
  assert.match(src, /initialValues\?/);
  assert.match(src, /mode\?:/);
  assert.match(src, /name="quoteId"/);
  assert.match(src, /Guardar cambios/);
  assert.match(src, /precios originales permanecen congelados/i);
  assert.match(src, /frozenUnitPrice/);
});

test("existe la pagina de edicion y usa updateQuoteAction en modo edit", () => {
  const src = read("../src/app/quotes/[id]/edit/page.tsx");
  assert.match(src, /updateQuoteAction/);
  assert.match(src, /mode="edit"/);
  assert.match(src, /initialValues=/);
  assert.match(src, /notFound|redirect\("\/quotes/); // no editable => fuera
  assert.match(src, /presupuestos.*editar|QUOTES_EDIT/s);
});

test("la lista de presupuestos ofrece Editar y Eliminar con guardas de estado y permiso", () => {
  const page = read("../src/app/quotes/page.tsx");
  assert.match(page, /\/quotes\/\$\{[^}]*\}\/edit|\/quotes\/\$\{quote\.id\}\/edit/);
  assert.match(page, /canEditQuotes/);
  assert.match(page, /canDeleteQuotes/);
  assert.match(page, /QuoteDeleteButton/);
  assert.match(page, /updated|deleted/); // banner de exito
  assert.match(page, /\/quotes\/\$\{quote\.id\}\/confirm/);
  const del = read("../src/app/quotes/quote-delete-button.tsx");
  assert.match(del, /"use client"/);
  assert.match(del, /deleteQuoteAction|action/);
  assert.match(del, /name="id"/);
});

test("la confirmacion permite vincular o crear el cliente antes de enviar a pedidos", () => {
  const page = read("../src/app/quotes/[id]/confirm/page.tsx");
  const form = read("../src/app/quotes/quote-confirmation-form.tsx");
  const action = read("../src/app/quotes/actions.ts");
  assert.match(page, /QuoteConfirmationForm/);
  assert.match(form, /Vincular cliente cargado/);
  assert.match(form, /Crear cliente desde prospecto/);
  assert.match(form, /Confirmar y enviar a Pedidos/);
  assert.match(action, /existingCustomerId/);
  assert.match(action, /customerName/);
});
