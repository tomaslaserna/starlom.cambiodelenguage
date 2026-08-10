import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_IMAGE_BYTES, validateProductImage } from "../src/lib/product-image.ts";

test("acepta una imagen PNG valida", () => {
  const r = validateProductImage({ name: "foto.png", mime: "image/png", size: 2048 });
  assert.equal(r.error, undefined);
  assert.equal(r.data?.extension, "png");
  assert.equal(r.data?.contentType, "image/png");
});

test("acepta JPG por extension jpeg/jpg", () => {
  assert.equal(validateProductImage({ name: "a.jpg", mime: "image/jpeg", size: 10 }).data?.contentType, "image/jpeg");
  assert.equal(validateProductImage({ name: "a.jpeg", mime: "", size: 10 }).data?.contentType, "image/jpeg");
});

test("rechaza extension no imagen", () => {
  assert.ok(validateProductImage({ name: "doc.pdf", mime: "application/pdf", size: 10 }).error);
});

test("rechaza imagen mayor al maximo", () => {
  assert.ok(validateProductImage({ name: "big.png", mime: "image/png", size: MAX_IMAGE_BYTES + 1 }).error);
});

test("rechaza tamano cero", () => {
  assert.ok(validateProductImage({ name: "x.png", mime: "image/png", size: 0 }).error);
});

test("rechaza mime que no coincide con la extension", () => {
  assert.ok(validateProductImage({ name: "x.png", mime: "image/gif", size: 10 }).error);
});
