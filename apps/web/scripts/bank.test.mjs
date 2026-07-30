import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_FILE_BYTES,
  PERSONAL_QUOTA_BYTES,
  SHARED_QUOTA_BYTES,
  formatBytes,
  quotaForScope,
  remainingQuota,
  validateBankFile,
  wouldExceedQuota,
} from "../src/lib/bank.ts";

test("quotaForScope devuelve la cuota correcta por scope", () => {
  assert.equal(quotaForScope("personal"), PERSONAL_QUOTA_BYTES);
  assert.equal(quotaForScope("shared"), SHARED_QUOTA_BYTES);
});

test("remainingQuota nunca es negativo", () => {
  assert.equal(remainingQuota(PERSONAL_QUOTA_BYTES - 100, "personal"), 100);
  assert.equal(remainingQuota(PERSONAL_QUOTA_BYTES + 5000, "personal"), 0);
});

test("wouldExceedQuota: entra si hay lugar", () => {
  assert.equal(wouldExceedQuota(400 * 1024 * 1024, 50 * 1024 * 1024, "personal"), false);
});

test("wouldExceedQuota: rechaza si se pasa", () => {
  assert.equal(wouldExceedQuota(480 * 1024 * 1024, 30 * 1024 * 1024, "personal"), true);
});

test("validateBankFile: acepta un PDF valido", () => {
  const result = validateBankFile({ name: "Lista de precios.pdf", mime: "application/pdf", size: 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.data?.extension, "pdf");
  assert.equal(result.data?.contentType, "application/pdf");
});

test("validateBankFile: rechaza extension no permitida", () => {
  const result = validateBankFile({ name: "virus.exe", mime: "application/octet-stream", size: 1024 });
  assert.ok(result.error);
  assert.equal(result.data, undefined);
});

test("validateBankFile: rechaza archivo mayor al maximo", () => {
  const result = validateBankFile({ name: "grande.pdf", mime: "application/pdf", size: MAX_FILE_BYTES + 1 });
  assert.ok(result.error);
});

test("validateBankFile: rechaza tamano cero", () => {
  const result = validateBankFile({ name: "vacio.pdf", mime: "application/pdf", size: 0 });
  assert.ok(result.error);
});

test("validateBankFile: acepta mime vacio y confia en la extension", () => {
  const result = validateBankFile({ name: "catalogo.PNG", mime: "", size: 2048 });
  assert.equal(result.error, undefined);
  assert.equal(result.data?.contentType, "image/png");
});

test("formatBytes es legible", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1024 * 1024), "1 MB");
});
