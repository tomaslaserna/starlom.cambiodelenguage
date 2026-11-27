import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loadPaymentActions(registerCustomerPaymentFromForm) {
  const source = readFileSync(new URL("../src/app/payments/actions.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const aliases = {
    "next/cache": { revalidatePath: () => undefined },
    "@/lib/api-response": { ApiError },
    "@/lib/customer-accounts": { voidCustomerPayment: async () => undefined },
    "@/lib/customer-payment-form": { registerCustomerPaymentFromForm },
    "@/lib/request-body": { uuidParam: (value) => value },
    "@/lib/route-auth": {
      COLLECTIONS_APPROVE_PERMISSION: {},
      COLLECTIONS_CREATE_PERMISSION: {},
      requireApiSession: async () => ({ companyId: 1, userId: "user-1" }),
    },
  };
  const moduleRequire = (specifier) => aliases[specifier] ?? require(specifier);
  Function("require", "module", "exports", compiled)(moduleRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

function loadCrmPaymentActions(registerCustomerPaymentFromForm) {
  const source = readFileSync(new URL("../src/app/crm/cobros/actions.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const aliases = {
    "next/cache": { revalidatePath: () => undefined },
    "@/lib/api-response": { ApiError },
    "@/lib/crm": { assertVendorOwnsClient: async () => undefined },
    "@/lib/customer-payment-form": { registerCustomerPaymentFromForm },
    "@/lib/request-body": { uuidParam: (value) => value },
    "@/lib/route-auth": {
      CRM_READ_PERMISSION: {},
      requireApiSession: async () => ({ companyId: 1, userId: "user-1" }),
    },
  };
  const moduleRequire = (specifier) => aliases[specifier] ?? require(specifier);
  Function("require", "module", "exports", compiled)(moduleRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

test("registerCustomerPaymentAction devuelve éxito serializable al navegador", async () => {
  const actions = loadPaymentActions(async () => undefined);

  const result = await actions.registerCustomerPaymentAction(new FormData());

  assert.deepEqual(result, { ok: true });
});

test("registerCustomerPaymentAction conserva el mensaje de una validación esperada", async () => {
  const actions = loadPaymentActions(async () => {
    throw new ApiError(409, "Este comprobante ya está vinculado a un pago.");
  });

  const result = await actions.registerCustomerPaymentAction(new FormData());

  assert.deepEqual(result, { ok: false, error: "Este comprobante ya está vinculado a un pago." });
});

test("registerCustomerPaymentAction no expone errores internos inesperados", async () => {
  const actions = loadPaymentActions(async () => {
    throw new Error("password=secreto");
  });

  const originalError = console.error;
  console.error = () => undefined;
  try {
    const result = await actions.registerCustomerPaymentAction(new FormData());
    assert.deepEqual(result, { ok: false, error: "No se pudo registrar el pago. Revisá los datos y volvé a intentar." });
  } finally {
    console.error = originalError;
  }
});

test("el registro desde CRM también devuelve las validaciones sin provocar error React", async () => {
  const actions = loadCrmPaymentActions(async () => {
    throw new ApiError(400, "El monto debe ser mayor a cero");
  });

  const result = await actions.registerCrmCustomerPaymentAction(new FormData());

  assert.deepEqual(result, { ok: false, error: "El monto debe ser mayor a cero" });
});
