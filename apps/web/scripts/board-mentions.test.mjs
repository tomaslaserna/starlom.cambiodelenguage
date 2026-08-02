import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMentions } from "../src/lib/board-mentions.ts";

const valid = ["augusto", "tomas", "francisco"];

test("detecta una mención válida", () => {
  assert.deepEqual(parseMentions("hola @augusto revisá esto", valid), ["augusto"]);
});

test("detecta varias menciones", () => {
  assert.deepEqual(parseMentions("@augusto y @tomas", valid).sort(), ["augusto", "tomas"]);
});

test("deduplica menciones repetidas", () => {
  assert.deepEqual(parseMentions("@augusto @augusto", valid), ["augusto"]);
});

test("es case-insensitive y devuelve el username canónico", () => {
  assert.deepEqual(parseMentions("che @AUGUSTO", valid), ["augusto"]);
});

test("ignora usuarios que no existen", () => {
  assert.deepEqual(parseMentions("@desconocido", valid), []);
});

test("no confunde un email con una mención", () => {
  assert.deepEqual(parseMentions("escribile a mail@tomas.com", valid), []);
});

test("mención al inicio del texto", () => {
  assert.deepEqual(parseMentions("@francisco arrancá vos", valid), ["francisco"]);
});

test("texto sin menciones", () => {
  assert.deepEqual(parseMentions("comprar insumos de limpieza", valid), []);
});

test("matchea usernames con espacios (nombre completo)", () => {
  const nombres = ["Augusto Finocchietti", "Francisco Valdes"];
  assert.deepEqual(parseMentions("revisá @Augusto Finocchietti gracias", nombres), ["Augusto Finocchietti"]);
});

test("no matchea si solo se escribe parte del nombre completo", () => {
  const nombres = ["Augusto Finocchietti"];
  assert.deepEqual(parseMentions("hola @Augusto", nombres), []);
});
