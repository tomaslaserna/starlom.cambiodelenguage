import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldPreventImplicitSubmit } from "../src/lib/form-submit-guard.ts";

test("bloquea Enter en un input de texto/numero (submit implicito)", () => {
  assert.equal(shouldPreventImplicitSubmit("Enter", "INPUT", "number"), true);
  assert.equal(shouldPreventImplicitSubmit("Enter", "INPUT", "text"), true);
});

test("permite Enter en un textarea (salto de linea)", () => {
  assert.equal(shouldPreventImplicitSubmit("Enter", "TEXTAREA"), false);
});

test("permite Enter en el boton submit y en cualquier boton", () => {
  assert.equal(shouldPreventImplicitSubmit("Enter", "INPUT", "submit"), false);
  assert.equal(shouldPreventImplicitSubmit("Enter", "BUTTON"), false);
});

test("no bloquea otras teclas", () => {
  assert.equal(shouldPreventImplicitSubmit("a", "INPUT", "number"), false);
  assert.equal(shouldPreventImplicitSubmit("Tab", "INPUT", "text"), false);
});

test("es tolerante a mayusculas/minusculas del tag y el type", () => {
  assert.equal(shouldPreventImplicitSubmit("Enter", "input", "SUBMIT"), false);
  assert.equal(shouldPreventImplicitSubmit("Enter", "textarea"), false);
});
