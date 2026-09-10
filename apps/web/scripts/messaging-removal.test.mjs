import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const src = new URL("../src/", import.meta.url);
function load(path, aliases = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, src), "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  Function("require", "module", "exports", compiled)((name) => aliases[name] ?? require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const requestBody = load("lib/request-body.ts", { "@/lib/api-response": { ApiError } });
const session = { companyId: 1, username: "ana", userId: "u1" };
function taskModule(query) {
  return load("lib/tasks.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/request-body": requestBody,
    "@/lib/db": {
      withCompanyContext: async (companyId, fn) => { assert.equal(companyId, 1); return fn({ query }); },
      queryWithCompanyContext: async (companyId, sql, params) => { assert.equal(companyId, 1); return query(sql, params); },
    },
  });
}

test("asignar una tarea conserva destinatario y recurrencia sin escribir mensajes", async () => {
  const calls = [];
  const tasks = taskModule(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 2 }] };
    if (sql.includes("INSERT INTO tareas_asignadas")) return { rows: [{ id: 7 }] };
    throw new Error("Unexpected query: " + sql);
  });
  assert.deepEqual(await tasks.createTask(session, { title: "Revisar pedido", assignedTo: "luis", recurrenceType: "semanal", recurrenceDayWeek: 2 }), { id: 7, type: "assigned" });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params, ["luis", 1]);
  assert.equal(calls[1].params[5], "ana");
  assert.equal(calls[1].params[6], "luis");
  assert.equal(calls[1].params[7], "semanal");
  assert.equal(calls[1].params[9], 2);
});

test("completar una tarea conserva la nota de cierre sin notificaciones internas", async () => {
  const calls = [];
  const tasks = taskModule(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT id, titulo")) return { rows: [{ id: 7, titulo: "Revisar", asignado_por: "luis" }] };
    if (sql.includes("UPDATE tareas_asignadas")) return { rows: [] };
    throw new Error("Unexpected query: " + sql);
  });
  assert.deepEqual(await tasks.completeTask(session, 7, { message: "Controlado" }), { id: 7, type: "assigned" });
  assert.deepEqual(calls[0].params, [7, 1, "ana"]);
  assert.deepEqual(calls[1].params, ["Controlado", 7, 1]);
  assert.equal(calls.length, 2);
});

test("recordatorios propios conservan su creación y finalización", async () => {
  const tasks = taskModule(async (sql) => {
    if (sql.includes("INSERT INTO recordatorios")) return { rows: [{ id: 9 }] };
    if (sql.includes("FROM tareas_asignadas")) return { rows: [] };
    if (sql.includes("UPDATE recordatorios")) return { rows: [{ id: 9 }] };
    throw new Error("Unexpected query: " + sql);
  });
  assert.deepEqual(await tasks.createTask(session, { title: "Llamar cliente" }), { id: 9, type: "personal" });
  assert.deepEqual(await tasks.completeTask(session, 9, { message: "" }), { id: 9, type: "personal" });
});

test("un destinatario inexistente no permite crear una tarea", async () => {
  let queries = 0;
  const tasks = taskModule(async () => { queries++; return { rows: [] }; });
  await assert.rejects(tasks.createTask(session, { title: "Revisar", assignedTo: "inexistente" }), (error) => error.status === 404);
  assert.equal(queries, 1);
});

test("calendario obtiene colaboradores sin cargar conversaciones", async () => {
  const tasks = taskModule(async (sql, params) => {
    assert.match(sql, /FROM usuarios/);
    assert.match(sql, /ue\.activo = TRUE/);
    assert.deepEqual(params, [1]);
    return { rows: [{ usuario: "ana" }, { usuario: "luis" }, { usuario: "" }] };
  });
  assert.deepEqual(await tasks.listTaskAssignees(session), ["luis"]);
});

test("el pizarrón conserva notas y menciones sin generar mensajes", async () => {
  const calls = [];
  const mentions = load("lib/board-mentions.ts");
  const board = load("lib/board.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/board-mentions": mentions,
    "@/lib/db": { withCompanyContext: async (companyId, fn) => {
      assert.equal(companyId, 1);
      return fn({ query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes("FOR UPDATE")) return { rows: [{ id: "n1" }] };
        if (sql.includes("FROM usuarios")) return { rows: [{ usuario: "luis" }] };
        if (/UPDATE board_notes|DELETE FROM board_note_mentions|INSERT INTO board_note_mentions/.test(sql)) return { rows: [] };
        throw new Error("Unexpected query: " + sql);
      } });
    } },
  });
  await board.updateBoardNote(session, "00000000-0000-0000-0000-000000000001", { text: "Revisar @luis" });
  assert.ok(calls.some(({ sql }) => sql.includes("UPDATE board_notes")));
  assert.ok(calls.some(({ sql, params }) => sql.includes("INSERT INTO board_note_mentions") && params[2] === "luis"));
  assert.ok(calls.every(({ sql }) => !/\bmensajes\b/.test(sql)));
});

test("no quedan rutas, componentes ni consultas de mensajería interna", () => {
  for (const path of ["app/messages/page.tsx", "app/messages/actions.ts", "app/api/messages/route.ts", "lib/messages.ts", "lib/message-attachments.ts", "components/message-notifier.tsx", "components/message-notifications.tsx"]) {
    assert.equal(existsSync(new URL(path, src)), false, path);
  }
  function scan(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (/\.tsx?$/.test(entry.name)) {
        assert.doesNotMatch(readFileSync(full, "utf8"), /(?:FROM|INTO|UPDATE|JOIN)\s+(?:public\.)?(?:mensajes|mensaje_adjuntos|mensaje_cargas)\b|["'`]\/api\/messages|@\/lib\/messages/, full);
      }
    }
  }
  scan(fileURLToPath(src));
});
