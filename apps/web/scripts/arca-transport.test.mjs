import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/api-response") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          export class ApiError extends Error {
            constructor(status, message) {
              super(message);
              this.status = status;
            }
          }
        `)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { postSoapXml } = await import("../src/lib/arca/xml.ts");

test("reintenta una consulta segura a ARCA cuando la conexion se corta transitoriamente", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new TypeError("fetch failed");
      error.cause = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
      throw error;
    }
    return new Response("<Envelope><Result>ok</Result></Envelope>", { status: 200 });
  };

  try {
    const response = await postSoapXml(
      "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
      "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado",
      "<Envelope />",
    );
    assert.match(response, /<Result>ok<\/Result>/);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no reenvia automaticamente una solicitud de CAE ante una respuesta ambigua", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    const error = new TypeError("fetch failed");
    error.cause = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    throw error;
  };

  try {
    await assert.rejects(
      postSoapXml(
        "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
        "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
        "<Envelope />",
      ),
      /ECONNRESET/,
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
