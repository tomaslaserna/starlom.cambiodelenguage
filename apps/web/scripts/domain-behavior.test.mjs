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

const searchOptions = loadTypeScriptModule("../src/lib/search-options.ts");
const format = loadTypeScriptModule("../src/lib/format.ts");
const quoteTotals = loadTypeScriptModule("../src/lib/quote-totals.ts");
const saleCommercialCode = loadTypeScriptModule("../src/lib/sale-commercial-code.ts");
const clientFiscal = loadTypeScriptModule("../src/lib/client-fiscal.ts");
const orderStatus = loadTypeScriptModule("../src/lib/order-status.ts");
const stock = loadTypeScriptModule("../src/lib/stock.ts", {
  "@/lib/api-response": { ApiError },
  "@/lib/order-status": orderStatus,
});
const stockImport = loadTypeScriptModule("../src/lib/stock-import.ts", {
  "@/lib/api-response": { ApiError },
});
const safeReturnPath = loadTypeScriptModule("../src/lib/safe-return-path.ts");
const sessionToken = loadTypeScriptModule("../src/lib/session-token.ts", {
  "@/lib/env": { envValue: () => "test-session-secret-with-enough-entropy" },
});
const productId = "28d84c33-122d-4480-a183-26da0dfd17f8";
const saleId = "0e93dbb2-5082-4ad8-aa2d-41581b1d1170";

test("business documents show commercial numbers and never UUIDs", () => {
  assert.equal(
    saleCommercialCode.formatSaleCommercialCode({
      commercialNumber: 7,
      saleNumber: "P-20261072",
      deliveryNumber: 123,
      legacyRemittanceNumber: 456,
    }),
    "0007",
  );
  assert.equal(
    saleCommercialCode.formatSaleCommercialCode({ commercialNumber: "12500", saleNumber: saleId }),
    "12500",
  );
  assert.equal(saleCommercialCode.formatSaleCommercialCode({ saleNumber: "P-1" }), "0001");
  assert.equal(saleCommercialCode.formatSaleCommercialCode({ saleNumber: "P-000015" }), "0015");
  assert.equal(
    saleCommercialCode.formatSaleCommercialCode({ saleNumber: "REM-2026-1071" }),
    "00001071",
  );
  assert.equal(
    saleCommercialCode.formatSaleCommercialCode({ saleNumber: saleId, deliveryNumber: 42 }),
    "00000042",
  );
  assert.equal(saleCommercialCode.formatSaleCommercialCode({ saleNumber: saleId }), "Sin número");
});

test("quote VAT supports hidden, 21 percent and 10.5 percent totals", () => {
  assert.deepEqual(quoteTotals.calculateQuoteTotals(1000, 0), {
    subtotal: 1000,
    vatAmount: 0,
    total: 1000,
  });
  assert.deepEqual(quoteTotals.calculateQuoteTotals(1000, 21), {
    subtotal: 1000,
    vatAmount: 210,
    total: 1210,
  });
  assert.deepEqual(quoteTotals.calculateQuoteTotals(999.99, 10.5), {
    subtotal: 999.99,
    vatAmount: 105,
    total: 1104.99,
  });
});

test("Postgres timestamps are presented in compact Argentina date and time", () => {
  assert.equal(format.formatDateTime("2026-07-24 10:00:00+00"), "24/07/2026 · 07:00");
  assert.equal(format.formatDateTime("2026-07-20 20:52:59.679319+00"), "20/07/2026 · 17:52");
  assert.equal(format.formatDateTime(null), "-");
});

test("order transitions allow direct delivery from loaded orders", () => {
  assert.equal(orderStatus.orderStatusTransitionError("cargado", "confirmado"), null);
  assert.equal(orderStatus.orderStatusTransitionError("cargado", "cancelado"), null);
  assert.equal(orderStatus.orderStatusTransitionError("cargado", "entregado"), null);
  assert.equal(orderStatus.orderStatusTransitionError("confirmado", "entregado"), null);
  assert.equal(orderStatus.orderStatusTransitionError("confirmado", "cancelado"), null);
  assert.match(orderStatus.orderStatusTransitionError("entregado", "cancelado"), /no puede modificarse/);
  assert.match(orderStatus.orderStatusTransitionError("confirmado", "cargado"), /No se puede volver/);
});

function confirmationStockClient({ currentStock, reservedStock, requested }) {
  return {
    async query(sql) {
      if (sql.includes("AS reserved_stock")) {
        return {
          rowCount: 1,
          rows: [{
            product_id: productId,
            product_name: "Producto de prueba",
            current_stock: String(currentStock),
            reserved_stock: String(reservedStock),
          }],
        };
      }
      if (sql.includes("HAVING SUM(si.quantity) > 0")) {
        return {
          rowCount: 1,
          rows: [{ product_id: productId, product_name: "Producto de prueba", quantity: String(requested) }],
        };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rowCount: 1, rows: [{ id: productId }] };
      }
      throw new Error(`Consulta inesperada en prueba de stock: ${sql}`);
    },
  };
}

test("confirmation reserves only stock still available after other confirmed orders", async () => {
  await assert.rejects(
    () => stock.assertSaleStockAvailableForConfirmation(
      confirmationStockClient({ currentStock: 10, reservedStock: 8, requested: 3 }),
      1,
      saleId,
    ),
    (error) => error instanceof ApiError && error.status === 409 && /pide 3, disponible 2/.test(error.message),
  );

  await assert.doesNotReject(() => stock.assertSaleStockAvailableForConfirmation(
    confirmationStockClient({ currentStock: 10, reservedStock: 7, requested: 3 }),
    1,
    saleId,
  ));
});

function deliveryStockClient({ requested }) {
  const writes = [];
  return {
    writes,
    async query(sql) {
      if (sql.includes("SELECT stock_discounted")) {
        return { rowCount: 1, rows: [{ stock_discounted: false }] };
      }
      if (sql.includes("HAVING SUM(si.quantity) > 0")) {
        return {
          rowCount: 1,
          rows: [{ product_id: productId, product_name: "Producto de prueba", quantity: String(requested) }],
        };
      }
      if (sql.includes("FROM products") && sql.includes("FOR UPDATE")) {
        return { rowCount: 1, rows: [{ id: productId }] };
      }
      if (sql.includes("INSERT INTO stock_movements") || sql.includes("UPDATE sales SET stock_discounted")) {
        writes.push(sql);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Consulta inesperada en prueba de entrega: ${sql}`);
    },
  };
}

test("delivery records the stock movement without requiring loaded inventory", async () => {
  const client = deliveryStockClient({ requested: 3 });
  await assert.doesNotReject(() => stock.discountSaleStockOnDelivery(
    client,
    1,
    saleId,
    "Entrega de prueba",
  ));
  assert.equal(client.writes.length, 2);
});

test("search ranking ignores accents, supports partial tokens and tolerates a small typo", () => {
  const options = [
    { label: "Lavandina concentrada", searchText: "LAV-001" },
    { label: "Detergente limon", searchText: "DET-002" },
    { label: "Ácido muriático", searchText: "ACI-003" },
  ];

  assert.equal(searchOptions.normalizeSearchText("ÁCIDO"), "acido");
  assert.equal(searchOptions.rankSearchOptions(options, "acido")[0]?.label, "Ácido muriático");
  assert.equal(searchOptions.rankSearchOptions(options, "lavandna")[0]?.label, "Lavandina concentrada");
  assert.equal(searchOptions.rankSearchOptions(options, "det lim")[0]?.label, "Detergente limon");
});

test("login return paths stay local", () => {
  assert.equal(safeReturnPath.safeLocalReturnPath("/orders/new?q=1"), "/orders/new?q=1");
  assert.equal(safeReturnPath.safeLocalReturnPath("https://example.com"), "/");
  assert.equal(safeReturnPath.safeLocalReturnPath("//example.com"), "/");
  assert.equal(safeReturnPath.safeLocalReturnPath("/\\example.com"), "/");
});

test("sessions slide for two hours but keep a twelve-hour absolute limit", () => {
  const timing = sessionToken.newSessionTiming(1_000);
  assert.equal(timing.expiresAt, 1_000 + 2 * 60 * 60);
  assert.equal(timing.absoluteExpiresAt, 1_000 + 12 * 60 * 60);
  assert.equal(sessionToken.newSessionExpiry(timing.absoluteExpiresAt, 1_000 + 11 * 60 * 60), timing.absoluteExpiresAt);

  const now = Math.floor(Date.now() / 1_000);
  const session = {
    userId: productId,
    username: "test",
    email: "test@example.com",
    displayName: "Test User",
    role: "administrador",
    companyId: 1,
    companyName: "Starlim",
    ...sessionToken.newSessionTiming(now),
  };
  const encoded = sessionToken.encodeSession(session);
  assert.equal(sessionToken.decodeSession(encoded)?.userId, productId);
  assert.equal(sessionToken.decodeSession(`${encoded}x`), null);
});

test("database timezone is configured at connection startup without concurrent queries", () => {
  const source = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
  assert.match(source, /options:\s*`-c timezone=\$\{BUSINESS_TIME_ZONE\}`/);
  assert.doesNotMatch(source, /pool\.on\(["']connect["']/);
});

test("stock JSON accepts a bare array and the legacy stock field as an exact recount", () => {
  const rows = stockImport.parseStockImportText(
    JSON.stringify([{ id: productId, stock: 12 }]),
    { defaultReason: "Recuento general" },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].productId, productId);
  assert.equal(rows[0].mode, "exacto");
  assert.equal(rows[0].quantity, 12);
  assert.deepEqual(rows[0].errors, []);
});

test("stock JSON accepts an items envelope and Spanish field names with integer quantities", () => {
  const rows = stockImport.parseStockImportText(
    JSON.stringify({ items: [{ codigo: "SKU-10", tipo: "salida", cantidad: "2", motivo: "Rotura" }] }),
  );

  assert.equal(rows[0].code, "SKU-10");
  assert.equal(rows[0].mode, "salida");
  assert.equal(rows[0].quantity, 2);
  assert.deepEqual(rows[0].errors, []);
});

test("stock imports reject decimal quantities", () => {
  const [row] = stockImport.parseStockImportText(
    JSON.stringify([{ codigo: "SKU-10", tipo: "entrada", cantidad: "2,5", motivo: "Compra" }]),
  );

  assert.equal(row.quantity, 2.5);
  assert.match(row.errors.join(" "), /numero entero/);
});

test("stock CSV detects semicolons and reports unsafe rows before commit", () => {
  const rows = stockImport.parseStockImportText(
    "id_producto;codigo;tipo;cantidad;motivo\n;SKU-1;entrada;10;Compra\n;SKU-2;;4;",
    { fileName: "stock.csv" },
  );

  assert.equal(rows[0].rowNumber, 2);
  assert.deepEqual(rows[0].errors, []);
  assert.match(rows[1].errors.join(" "), /tipo valido/);
  assert.match(rows[1].errors.join(" "), /motivo/);
});

test("stock imports reject unbounded quantities before reaching Postgres", () => {
  const [row] = stockImport.parseStockImportText(
    JSON.stringify([{ codigo: "SKU-10", tipo: "entrada", cantidad: 1_000_000_001, motivo: "Carga incorrecta" }]),
  );

  assert.equal(stockImport.MAX_STOCK_IMPORT_QUANTITY, 1_000_000_000);
  assert.match(row.errors.join(" "), /supera el limite permitido/);
});

test("hasCompleteFiscalData gates fiscal invoices on CUIT + condición fiscal", () => {
  const { hasCompleteFiscalData } = clientFiscal;
  assert.equal(
    hasCompleteFiscalData({ taxId: "20-12345678-3", fiscalCondition: "Responsable Inscripto" }),
    true,
  );
  assert.equal(hasCompleteFiscalData({ taxId: "20123456783", fiscalCondition: "Monotributo" }), true);
  assert.equal(hasCompleteFiscalData({ taxId: "", fiscalCondition: "Responsable Inscripto" }), false);
  assert.equal(hasCompleteFiscalData({ taxId: "20-12345678-3", fiscalCondition: "" }), false);
  assert.equal(hasCompleteFiscalData({ taxId: "123", fiscalCondition: "Monotributo" }), false);
  assert.equal(hasCompleteFiscalData({ taxId: null, fiscalCondition: null }), false);
});
