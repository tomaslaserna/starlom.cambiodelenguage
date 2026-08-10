import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyQuote, topQuoteClients, formatVigencia } from "../src/lib/crm-quotes.ts";

test("classifyQuote: pendiente segun dias restantes", () => {
  assert.equal(classifyQuote("pendiente", -1, false), "vencidos");
  assert.equal(classifyQuote("pendiente", 0, false), "por_vencer");
  assert.equal(classifyQuote("pendiente", 3, false), "por_vencer");
  assert.equal(classifyQuote("pendiente", 4, false), "vigentes");
  assert.equal(classifyQuote("pendiente", null, false), "vigentes");
});

test("classifyQuote: aceptada solo si es del mes; otros estados se ignoran", () => {
  assert.equal(classifyQuote("aceptada", null, true), "aceptados");
  assert.equal(classifyQuote("aceptada", null, false), null);
  assert.equal(classifyQuote("rechazada", 5, false), null);
});

test("topQuoteClients ordena por cantidad, desempata por aceptados asc, corta en n", () => {
  const q = (clientName, status) => ({
    id: "x", quoteNumber: "P", clientName, total: 0, issueDate: null,
    expirationDate: null, daysRemaining: 0, status, approvedThisMonth: false,
  });
  const rows = [q("A", "pendiente"), q("A", "aceptada"), q("B", "pendiente"), q("B", "pendiente"), q("C", "pendiente")];
  const top = topQuoteClients(rows, 2);
  assert.equal(top.length, 2);
  assert.deepEqual(top[0], { clientName: "B", cantidad: 2, aceptados: 0 });
  assert.deepEqual(top[1], { clientName: "A", cantidad: 2, aceptados: 1 });
});

test("formatVigencia", () => {
  assert.equal(formatVigencia(null, null), "Vigente");
  assert.equal(formatVigencia("2026-01-01", null), "Vigente");
  assert.equal(formatVigencia("2026-01-01", "2026-08-31"), "Válida hasta 31/08/2026");
});
