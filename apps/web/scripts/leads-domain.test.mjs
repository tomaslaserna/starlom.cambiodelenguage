import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(relativePath, aliases = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const moduleRequire = (specifier) => aliases[specifier] ?? require(specifier);
  Function("require", "module", "exports", compiled)(moduleRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const requestBody = loadTypeScriptModule("../src/lib/request-body.ts", {
  "@/lib/api-response": { ApiError },
});
const domain = loadTypeScriptModule("../src/lib/leads-domain.ts", {
  "@/lib/api-response": { ApiError },
  "@/lib/request-body": requestBody,
});

test("normalizeLeadStage mapea válidos y cae a 'nuevo' si es inválido", () => {
  assert.equal(domain.normalizeLeadStage("contactado"), "contactado");
  assert.equal(domain.normalizeLeadStage("CONVERTIDO"), "convertido");
  assert.equal(domain.normalizeLeadStage("cualquiera"), "nuevo");
});

test("las cadencias automáticas escalan según el resultado comercial", () => {
  assert.equal(domain.leadCadenceDays("pedido_probable"), 3);
  assert.equal(domain.leadCadenceDays("interesado"), 3);
  assert.equal(domain.leadCadenceDays("contactado"), 7);
  assert.equal(domain.leadCadenceDays("sin_respuesta"), 15);
  assert.equal(domain.leadCadenceDays("no_interesado"), 30);
  assert.equal(domain.leadStageAfterContact("nuevo", "sin_respuesta"), "contactado");
  assert.equal(domain.leadStageAfterContact("contactado", "interesado"), "interesado");
});

test("leadInputFromBody exige nombre y valida la fecha de seguimiento", () => {
  assert.throws(() => domain.leadInputFromBody({ name: "" }), /nombre es obligatorio/i);
  assert.throws(
    () => domain.leadInputFromBody({ name: "Kiosco", nextFollowup: "12-08-2026" }),
    /fecha de seguimiento/i,
  );
  const input = domain.leadInputFromBody({
    name: "Kiosco Sol",
    phone: "111",
    email: "a@b.com",
    locality: "Palermo",
    source: "Feria",
    nextFollowup: "2026-08-20",
    notes: "Interesado",
  });
  assert.deepEqual(input, {
    name: "Kiosco Sol",
    phone: "111",
    email: "a@b.com",
    locality: "Palermo",
    source: "Feria",
    nextFollowup: "2026-08-20",
    notes: "Interesado",
  });
  assert.equal(domain.leadInputFromBody({ name: "X" }).nextFollowup, null);
});

test("buildConversionNote arma la nota sólo con los datos presentes", () => {
  const base = {
    id: "1", name: "X", phone: "", email: "", locality: "", source: "", stage: "interesado",
    nextFollowup: null, notes: "", assignedSeller: "VEND", convertedClientId: null, createdAt: "",
  };
  assert.equal(domain.buildConversionNote(base), "Lead convertido.");
  assert.equal(
    domain.buildConversionNote({ ...base, email: "a@b.com", source: "Feria", notes: "Ok" }),
    "Lead convertido. Email: a@b.com. Origen: Feria. Ok",
  );
});

test("leadToCustomerInput mapea a CustomerInput (locality→city, seller, activo)", () => {
  const lead = {
    id: "1", name: "Kiosco Sol", phone: "111", email: "a@b.com", locality: "Palermo",
    source: "Feria", stage: "interesado", nextFollowup: null, notes: "Ok",
    assignedSeller: "JUAN", convertedClientId: null, createdAt: "",
  };
  const input = domain.leadToCustomerInput(lead, "Factura B");
  assert.equal(input.name, "Kiosco Sol");
  assert.equal(input.phone, "111");
  assert.equal(input.city, "Palermo");
  assert.equal(input.seller, "JUAN");
  assert.equal(input.assignedSeller, "JUAN");
  assert.equal(input.receiptType, "Factura B");
  assert.equal(input.status, "activo");
  assert.match(input.observation, /Email: a@b\.com/);
  assert.deepEqual(
    Object.keys(input).sort(),
    ["address","assignedSeller","businessName","city","name","observation","phone","priceList","province","receiptType","seller","status","taxId","taxIdType","vatCondition"],
  );
});
