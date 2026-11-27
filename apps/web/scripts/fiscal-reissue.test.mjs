import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, aliases = {}) {
  const m = { exports: {} };
  Function(
    "require",
    "module",
    "exports",
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
  )((s) => aliases[s] ?? require(s), m, m.exports);
  return m.exports;
}
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const { runReissue, validateReissueSnapshot } = load(
  "../src/lib/fiscal-reissue-domain.ts",
  { "@/lib/api-response": { ApiError } },
);
const snapshot = () => ({
  saleId: "sale",
  clientId: "client",
  total: 121,
  vatRate: 21,
  source: {
    name: "OLD SRL",
    document: "30717394832",
    condition: "Responsable Inscripto",
    address: "",
  },
  target: {
    name: "CORTEO SRL",
    document: "30714850748",
    condition: "Responsable Inscripto",
    address: "",
  },
  original: {
    pointOfSale: 2,
    receiptType: 1,
    receiptNumber: 168,
    cae: "86484612754211",
    caeExpiresAt: "2026-12-06",
    issueDate: "2026-11-26",
  },
  items: [
    { code: "1", name: "ITEM", quantity: 1, unitPrice: 100, amount: 100 },
  ],
  paymentCondition: "Cuenta corriente",
});
function fixture() {
  let saved = {
    snapshot: snapshot(),
    reason: "Cambio de razón social",
    creditId: "credit",
    invoiceId: "invoice",
    state: "prepared",
    credit: null,
    invoice: null,
    error: "",
  };
  return {
    load: () => structuredClone(saved),
    save: async (change) => {
      saved = { ...saved, ...structuredClone(change) };
      return structuredClone(saved);
    },
  };
}
const approval = (kind) => ({
  pointOfSale: 2,
  receiptType: kind === "credit" ? 3 : 1,
  receiptNumber: kind === "credit" ? 12 : 180,
  issueDate: "2026-11-27",
  cae: "86484612754212",
  caeExpiresAt: "2026-12-07",
  observations: [],
});
test("validates recipients, unchanged total/detail and compatible invoice class", () => {
  validateReissueSnapshot(snapshot());
  for (const mutate of [
    (s) => (s.target.document = s.source.document),
    (s) => (s.total = 0),
    (s) => (s.vatRate = 0),
    (s) => (s.items = []),
    (s) => (s.original.receiptType = 6),
    (s) => (s.target.document = "12345678901"),
    (s) => (s.items[0].quantity = -1),
  ]) {
    const s = snapshot();
    mutate(s);
    assert.throws(() => validateReissueSnapshot(s));
  }
});
test("credit approved before replacement, immutable identities and idempotent completion", async () => {
  const store = fixture();
  const calls = [];
  const issue = async (kind, record) => {
    calls.push([kind, record]);
    if (kind === "invoice") assert.ok(store.load().credit);
    return approval(kind);
  };
  await runReissue(store.load(), store.save, issue);
  assert.equal(store.load().state, "completed");
  assert.deepEqual(
    calls.map((x) => x[0]),
    ["credit", "invoice"],
  );
  assert.equal(calls[0][1].snapshot.source.document, "30717394832");
  assert.equal(calls[1][1].snapshot.target.document, "30714850748");
  await runReissue(store.load(), store.save, issue);
  assert.equal(calls.length, 2);
});
test("replacement failure preserves approved credit and retry resumes only invoice", async () => {
  const store = fixture();
  let credits = 0;
  await assert.rejects(() =>
    runReissue(store.load(), store.save, async (k) => {
      if (k === "credit") {
        credits++;
        return approval(k);
      }
      throw Error("timeout");
    }),
  );
  assert.equal(store.load().state, "review_required");
  assert.ok(store.load().credit);
  assert.equal(store.load().invoice, null);
  await runReissue(store.load(), store.save, async (k) => {
    assert.equal(k, "invoice");
    return approval(k);
  });
  assert.equal(credits, 1);
  assert.equal(store.load().state, "completed");
});
test("credit failure never emits replacement; approval persistence failure never advances", async () => {
  const store = fixture();
  const calls = [];
  await assert.rejects(() =>
    runReissue(store.load(), store.save, async (k) => {
      calls.push(k);
      throw Error("ARCA unavailable");
    }),
  );
  assert.deepEqual(calls, ["credit"]);
  assert.equal(store.load().state, "review_required");
  assert.equal(store.load().credit, null);
  let stages = [];
  await assert.rejects(() =>
    runReissue(
      fixture().load(),
      async (v) => {
        if (v.credit) throw Error("database offline");
        stages.push(v.state);
        return v;
      },
      async (k) => {
        assert.equal(k, "credit");
        return approval(k);
      },
    ),
  );
  assert.ok(!stages.includes("invoice_pending"));
});
test("malformed provider approval cannot complete a stage", async () => {
  const store = fixture();
  await assert.rejects(() =>
    runReissue(store.load(), store.save, async () => ({
      ...approval("credit"),
      cae: "",
    })),
  );
  assert.equal(store.load().credit, null);
});
import { PGlite } from "@electric-sql/pglite";
const domain = { runReissue, validateReissueSnapshot };
const fiscalValidation = load("../src/lib/fiscal-reissue-validation.ts", {
  "@/lib/api-response": { ApiError },
  "@/lib/vat-calculation": load("../src/lib/vat-calculation.ts"),
});
const fiscalComposition = {
  netAmount: 100,
  vatAmount: 21,
  nonTaxableAmount: 0,
  exemptAmount: 0,
  otherTaxesAmount: 0,
  vatConditionId: 1,
  vatLines: [{ id: 5, base: 100, amount: 21 }],
};
test("service persists an immutable pair without changing sales, stock, delivery or payments; tenant and note guards", async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE starlim_app; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA starlim_arca;
 CREATE TABLE sales(id uuid PRIMARY KEY,empresa_id int,client_id uuid,client_name text,client_document text,total_amount numeric,fiscal_vat_rate numeric,fiscal_point_of_sale int,fiscal_receipt_type int,fiscal_receipt_number int,cae text,cae_expires_at date,fiscal_issue_date date,sale_date date,payment_condition text,fiscal_status text);
 CREATE TABLE clients(id uuid PRIMARY KEY,empresa_id int,legal_name text,display_name text,tax_id text,fiscal_condition text,address text);
 CREATE TABLE products(id uuid PRIMARY KEY,empresa_id int,sku text,name text);
 CREATE TABLE sale_items(id uuid PRIMARY KEY,sale_id uuid,empresa_id int,product_id uuid,description text,quantity numeric,unit_price numeric,total_amount numeric);
 CREATE TABLE sales_internal_documents(id uuid PRIMARY KEY,sale_id uuid,empresa_id int,class_name text);
 CREATE TABLE stock(id int,quantity int); INSERT INTO stock VALUES(1,10);
 CREATE TABLE deliveries(id int,status text); INSERT INTO deliveries VALUES(1,'entregado');
 CREATE TABLE payments(id int,amount numeric); INSERT INTO payments VALUES(1,121);
 CREATE TABLE current_account_movements(id int,amount numeric); INSERT INTO current_account_movements VALUES(1,0);
 INSERT INTO clients VALUES('11111111-1111-4111-8111-111111111111',1,'CORTEO SRL','PINAR','30714850748','Responsable Inscripto','Córdoba');
 INSERT INTO sales VALUES('22222222-2222-4222-8222-222222222222',1,'11111111-1111-4111-8111-111111111111','CLUB DE CAMPO SRL','30717394832',121,21,2,1,168,'86484612754211','2026-12-06','2026-11-26','2026-11-26','Cuenta corriente','aprobado');
 INSERT INTO sale_items VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',1,NULL,'ITEM',1,100,100);`);
  await db.exec(
    "ALTER TABLE sales ADD COLUMN order_status text DEFAULT 'entregado', ADD COLUMN status text DEFAULT 'entregado'; ALTER TABLE sales_internal_documents ADD COLUMN fiscal boolean DEFAULT false, ADD COLUMN account_adjusted boolean DEFAULT true, ADD COLUMN stock_adjusted boolean DEFAULT true, ADD COLUMN amount numeric DEFAULT 0, ADD COLUMN detail_json jsonb DEFAULT '[]';",
  );
  await db.exec(
    readFileSync(
      new URL(
        "../../../supabase/migrations/20261127153520_fiscal_reissuance.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const query = async (company, sql, args = []) => {
    await db.query("SELECT set_config('app.current_empresa_id',$1,false)", [
      String(company),
    ]);
    return db.query(sql, args);
  };
  let queue = Promise.resolve();
  let failInvoice = true;
  const issued = [];
  const service = load("../src/lib/fiscal-reissue.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/fiscal-reissue-domain": domain,
    "@/lib/fiscal-reissue-validation": fiscalValidation,
    "@/lib/fiscal-reissue-returns": load(
      "../src/lib/fiscal-reissue-returns.ts",
      { "@/lib/api-response": { ApiError } },
    ),
    "@/lib/order-status": load("../src/lib/order-status.ts"),
    "@/lib/db": {
      queryWithCompanyContext: query,
      withCompanyContext: async (company, fn) => {
        await query(company, "BEGIN");
        try {
          const v = await fn({ query: (sql, args) => db.query(sql, args) });
          await db.exec("COMMIT");
          return v;
        } catch (e) {
          await db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    "@/lib/arca/config": { getArcaConfig: () => ({ pointOfSale: 2 }) },
    "@/lib/arca/wsfe": {
      receiptTypeForArcaVatCondition: () => 1,
      consultArcaAuthorizedReceipt: async () => ({
        ...snapshot().original,
        ...fiscalComposition,
        customerDocument: "30717394832",
        totalAmount: 121,
      }),
    },
    "@/lib/arca/invoice-attempt": {
      withInvoiceLock: (fn) => {
        const p = queue.then(fn);
        queue = p.catch(() => {});
        return p;
      },
      authorizeReservedInvoice: async (company, id, review, input) => {
        if (input.receiptType === 1 && failInvoice)
          throw Error("invoice timeout");
        issued.push({ id, input });
        return approval(input.receiptType === 3 ? "credit" : "invoice");
      },
    },
  });
  const session = {
    companyId: 1,
    userId: "44444444-4444-4444-8444-444444444444",
  };
  const sale = "22222222-2222-4222-8222-222222222222";
  const before = await db.query(
    "SELECT to_jsonb(s) AS row FROM sales s UNION ALL SELECT to_jsonb(s) FROM sale_items s UNION ALL SELECT to_jsonb(s) FROM stock s UNION ALL SELECT to_jsonb(s) FROM deliveries s UNION ALL SELECT to_jsonb(s) FROM payments s UNION ALL SELECT to_jsonb(s) FROM current_account_movements s",
  );
  const p = await service.previewFiscalReissue(1, sale);
  const fingerprint = service.reissueFingerprint(p);
  await assert.rejects(() =>
    service.executeFiscalReissue(
      session,
      sale,
      "Cambio de razón social",
      p.source.name,
      "stale",
    ),
  );
  await assert.rejects(
    () =>
      service.executeFiscalReissue(
        session,
        sale,
        "Cambio de razón social",
        p.source.name,
        fingerprint,
      ),
    /invoice timeout/,
  );
  assert.equal(
    (await service.getFiscalReissue(1, sale)).state,
    "review_required",
  );
  assert.ok((await service.getFiscalReissue(1, sale)).credit);
  // Changing the client afterwards must not alter the frozen target or original PDFs.
  await db.query("UPDATE clients SET legal_name='CHANGED' WHERE empresa_id=1");
  failInvoice = false;
  await Promise.all([
    service.executeFiscalReissue(
      session,
      sale,
      "ignored",
      "ignored",
      "ignored",
    ),
    service.executeFiscalReissue(
      session,
      sale,
      "ignored",
      "ignored",
      "ignored",
    ),
  ]);
  const completed = await service.getFiscalReissue(1, sale);
  assert.equal(completed.state, "completed");
  assert.equal(completed.snapshot.target.name, "CORTEO SRL");
  assert.equal(issued.length, 2);
  assert.notEqual(issued[0].id, issued[1].id);
  assert.equal(issued[0].input.customerDocument, "30717394832");
  assert.equal(issued[1].input.customerDocument, "30714850748");
  assert.equal(await service.getFiscalReissue(2, sale), null);
  await assert.rejects(() => service.assertSaleNotReissued(1, sale));
  await assert.rejects(
    () =>
      query(
        1,
        "UPDATE starlim_arca.reissues SET reason='changed' WHERE sale_id=$1",
        [sale],
      ),
    /inmutables/,
  );
  await assert.rejects(
    () =>
      query(
        1,
        "INSERT INTO sales_internal_documents VALUES(gen_random_uuid(),$1,1,'NC')",
        [sale],
      ),
    /refacturación/,
  );
  const after = await db.query(
    "SELECT to_jsonb(s) AS row FROM sales s UNION ALL SELECT to_jsonb(s) FROM sale_items s UNION ALL SELECT to_jsonb(s) FROM stock s UNION ALL SELECT to_jsonb(s) FROM deliveries s UNION ALL SELECT to_jsonb(s) FROM payments s UNION ALL SELECT to_jsonb(s) FROM current_account_movements s",
  );
  assert.deepEqual(after.rows, before.rows);
  await db.exec(
    "GRANT USAGE ON SCHEMA starlim_arca TO starlim_app; SET ROLE starlim_app;",
  );
  assert.equal(
    (await query(2, "SELECT * FROM starlim_arca.reissues")).rows.length,
    0,
  );
  assert.equal(
    (await query(1, "SELECT * FROM starlim_arca.reissues")).rows.length,
    1,
  );
  await db.close();
});
test("reserved credit recovery rejects a receipt linked to a different original", async () => {
  const input = {
    customerDocument: "30717394832",
    customerVatCondition: "Responsable Inscripto",
    receiptType: 3,
    totalAmount: 121,
    vatRate: 21,
    associatedReceipt: { pointOfSale: 2, receiptType: 1, receiptNumber: 168 },
  };
  const saved = {
    number: 12,
    issued_on: "20261127",
    point: 2,
    kind: 3,
    document: input.customerDocument,
    cents: "12100",
    vat: "21",
    vat_condition: input.customerVatCondition,
  };
  const mod = load("../src/lib/arca/invoice-attempt.ts", {
    "@/lib/fiscal-reissue-validation": fiscalValidation,
    "@/lib/api-response": { ApiError },
    "@/lib/arca/config": {
      getArcaConfig: () => ({ mode: "testing", cuit: 1, pointOfSale: 2 }),
    },
    "@/lib/db": {
      getDbPool: () => ({ query: async () => ({ rows: [saved] }) }),
    },
    "@/lib/arca/wsfe": {
      ArcaReceiptNotFound: class extends Error {},
      authorizeArcaInvoice: async () => {
        throw Error("unexpected new issue");
      },
      consultArcaAuthorizedReceipt: async () => ({
        ...approval("credit"),
        customerDocument: input.customerDocument,
        totalAmount: 121,
        associatedReceipts: [
          { ...input.associatedReceipt, receiptNumber: 999 },
        ],
      }),
    },
  });
  await assert.rejects(
    () => mod.authorizeReservedInvoice(1, "credit", false, input),
    /conciliación/,
  );
});
test("PDF rendering uses frozen recipient, authorized values and reason for every stage", async () => {
  const calls = [];
  let record = {
    ...fixture().load(),
    id: "r",
    credit: approval("credit"),
    invoice: approval("invoice"),
  };
  const renderer = {
    createPdfFile: async (filename, fn) => {
      fn({
        pdf: new Proxy(
          {},
          {
            get:
              (_, method) =>
              (...args) =>
                calls.push({ method, args }),
          },
        ),
      });
      return { filename };
    },
    pdfDate: (v) => v,
    pdfMoney: (v) => v.toFixed(2),
    pdfNumber: (v) => String(v),
  };
  const mod = load("../src/lib/pdf/fiscal-reissue.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/fiscal-reissue": { getFiscalReissue: async () => record },
    "@/lib/pdf/renderer": renderer,
    "@/lib/pdf/documents": { buildArcaQrImage: async () => Buffer.from("qr") },
    "@/lib/vat-calculation": load("../src/lib/vat-calculation.ts"),
  });
  for (const [stage, party] of [
    ["original", "OLD SRL"],
    ["credit", "OLD SRL"],
    ["invoice", "CORTEO SRL"],
  ]) {
    calls.length = 0;
    await mod.buildFiscalReissuePdf(1, "sale", stage);
    assert.equal(
      calls.find((c) => c.method === "fiscalClientBox").args[0].name,
      party,
    );
    assert.equal(
      calls.find((c) => c.method === "fiscalSummary").args[2],
      "121.00",
    );
    if (stage === "credit")
      assert.equal(
        calls.find((c) => c.method === "note").args[0],
        "Cambio de razón social",
      );
  }
  record = { ...record, invoice: null };
  await assert.rejects(() => mod.buildFiscalReissuePdf(1, "sale", "invoice"));
});
test("fiscal preflight rejects mismatched VAT, unknown recipient conditions and cancelled sale", () => {
  const validation = load("../src/lib/fiscal-reissue-validation.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/vat-calculation": load("../src/lib/vat-calculation.ts"),
  });
  const remote = {
    ...snapshot().original,
    customerDocument: "30717394832",
    totalAmount: 121,
    netAmount: 100,
    vatAmount: 21,
    exemptAmount: 0,
    nonTaxableAmount: 0,
    otherTaxesAmount: 0,
    vatConditionId: 1,
    vatLines: [{ id: 5, base: 100, amount: 21 }],
    associatedReceipts: [],
  };
  assert.equal(
    validation.validateOriginalFiscalReceipt(snapshot(), remote),
    "Responsable Inscripto",
  );
  for (const change of [
    { vatAmount: 0 },
    { netAmount: 121 },
    { exemptAmount: 1 },
    { otherTaxesAmount: 1 },
    { vatConditionId: 0 },
    { vatLines: [{ id: 4, base: 100, amount: 21 }] },
    { receiptNumber: 999 },
  ])
    assert.throws(() =>
      validation.validateOriginalFiscalReceipt(snapshot(), {
        ...remote,
        ...change,
      }),
    );
  assert.equal(
    validation.requireCompatibleTargetCondition("IVA Responsable Inscripto"),
    1,
  );
  assert.throws(() =>
    validation.requireCompatibleTargetCondition("unrecognized"),
  );
  assert.throws(() => validation.assertReissuableOrder("cancelado"));
  validation.assertReissuableOrder("entregado");
});

test("fiscal book includes each credit and replacement on its own fiscal issue date", async () => {
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA starlim_arca;
 CREATE TABLE sales(empresa_id int,total_amount numeric,fiscal_receipt_type int,receipt_type int,fiscal_vat_rate numeric,fiscal_status text,cae text,fiscal_issue_date date,fiscal_authorized_at timestamptz,sale_date date);
 CREATE TABLE sales_internal_documents(empresa_id int,amount numeric,fiscal_receipt_type int,receipt_type int,fiscal_vat_rate numeric,class_name text,fiscal boolean,fiscal_status text,cae text,fiscal_issue_date date,fiscal_authorized_at timestamptz,created_at timestamptz);
 CREATE TABLE purchases(empresa_id int,tax_mode text,vat_rate numeric,total_amount numeric,status text,purchase_date date);
 CREATE TABLE starlim_arca.reissues(company_id int,snapshot jsonb,credit jsonb,invoice jsonb);
 INSERT INTO sales VALUES(1,121,1,1,21,'aprobado','12345678901234','2026-11-26',NULL,'2026-11-26');
 INSERT INTO starlim_arca.reissues VALUES(1,'{"total":121}','{"issueDate":"2026-11-30"}','{"issueDate":"2026-12-01"}');
 INSERT INTO starlim_arca.reissues VALUES(2,'{"total":999}','{"issueDate":"2026-11-30"}','{"issueDate":"2026-11-30"}');`);
  let period = "2026-11";
  const ledger = load("../src/lib/fiscal-ledger.ts", {
    "@/lib/db": {
      queryWithCompanyContext: async (_, sql, args) => db.query(sql, args),
    },
    "@/lib/month-range": {
      currentMonth: () => period,
      monthRange: (p) =>
        p === "2026-11"
          ? { start: "2026-11-01", endExclusive: "2026-12-01" }
          : { start: "2026-12-01", endExclusive: "2027-01-01" },
    },
    "@/lib/order-status": {},
  });
  let result = await ledger.getFiscalVatSummary(1);
  assert.equal(result.salesVatDebit, 21);
  assert.equal(result.creditNotesVat, 21);
  assert.equal(result.netVatBalance, 0);
  assert.equal(result.fiscalSalesTotal, 121);
  period = "2026-12";
  result = await ledger.getFiscalVatSummary(1);
  assert.equal(result.salesVatDebit, 21);
  assert.equal(result.creditNotesVat, 0);
  assert.equal(result.netVatBalance, 21);
  await db.exec(`UPDATE starlim_arca.reissues SET snapshot='{"total":500779.57,"replacementTotal":380695.81}',
    credit='{"issueDate":"2026-12-01"}',invoice='{"issueDate":"2026-12-01"}' WHERE company_id=1`);
  result = await ledger.getFiscalVatSummary(1);
  await db.close();
  assert.equal(result.salesVatDebit, 66071.17);
  assert.equal(result.creditNotesVat, 86912.16);
});
test("durable reservation reconciles remote approval after timeout without a second emission", async () => {
  let saved;
  let sends = 0;
  const input = {
    customerDocument: "30717394832",
    customerVatCondition: "Responsable Inscripto",
    receiptType: 3,
    totalAmount: 121,
    vatRate: 21,
    associatedReceipt: { pointOfSale: 2, receiptType: 1, receiptNumber: 168 },
  };
  const remote = {
    ...approval("credit"),
    ...fiscalComposition,
    customerDocument: input.customerDocument,
    totalAmount: 121,
    associatedReceipts: [input.associatedReceipt],
  };
  const db = {
    query: async (sql, args) => {
      if (sql.startsWith("INSERT")) {
        saved = {
          number: 12,
          issued_on: "20261127",
          point: 2,
          kind: 3,
          document: input.customerDocument,
          cents: "12100",
          vat: "21",
          vat_condition: input.customerVatCondition,
        };
        return { rows: [] };
      }
      return { rows: saved ? [saved] : [] };
    },
  };
  const wsfe = {
    ArcaReceiptNotFound: class extends Error {},
    authorizeArcaInvoice: async (input, hooks) => {
      sends++;
      await hooks.reserve(12, "20261127");
      throw Error("timeout after approval");
    },
    consultArcaAuthorizedReceipt: async () => remote,
  };
  const mod = load("../src/lib/arca/invoice-attempt.ts", {
    "@/lib/fiscal-reissue-validation": fiscalValidation,
    "@/lib/api-response": { ApiError },
    "@/lib/arca/config": {
      getArcaConfig: () => ({ mode: "testing", cuit: 1, pointOfSale: 2 }),
    },
    "@/lib/db": { getDbPool: () => db },
    "@/lib/arca/wsfe": wsfe,
  });
  const a = await mod.authorizeReservedInvoice(1, "credit", false, input, true);
  assert.equal(a.cae, remote.cae);
  await mod.authorizeReservedInvoice(1, "credit", false, input, true);
  assert.equal(sends, 1);
  remote.vatAmount = 0;
  await assert.rejects(
    () => mod.authorizeReservedInvoice(1, "credit", false, input, true),
    /conciliación/,
  );
  assert.equal(sends, 1);
});
test("net replacement removes already returned items without repeating their commercial adjustment", () => {
  const { netReplacement } = load("../src/lib/fiscal-reissue-returns.ts", {
    "@/lib/api-response": { ApiError },
  });
  const s = snapshot();
  s.total = 500779.57;
  s.items = [
    {
      id: "p1",
      code: "A",
      name: "RETURNED",
      quantity: 5,
      unitPrice: 19516.86,
      amount: 97584.3,
    },
    {
      id: "p2",
      code: "B",
      name: "RETURNED2",
      quantity: 1,
      unitPrice: 1658.48,
      amount: 1658.48,
    },
    {
      id: "p3",
      code: "C",
      name: "REMAINING",
      quantity: 1,
      unitPrice: 314624.63,
      amount: 314624.63,
    },
  ];
  const notes = [
    {
      id: "n1",
      amount: 118077,
      detail: [{ id: "p1", quantity: 5, subtotal: 97584.3 }],
      accountAdjusted: true,
      stockAdjusted: true,
      fiscal: false,
      className: "NC",
    },
    {
      id: "n2",
      amount: 2006.76,
      detail: [{ id: "p2", quantity: 1, subtotal: 1658.48 }],
      accountAdjusted: true,
      stockAdjusted: true,
      fiscal: false,
      className: "NC",
    },
  ];
  const result = netReplacement(s, notes);
  assert.equal(result.replacementTotal, 380695.81);
  assert.equal(result.invoiceItems.length, 1);
  assert.equal(result.invoiceItems[0].name, "REMAINING");
  assert.equal(result.operationalReturns.length, 2);
  assert.equal(s.items.length, 3);
  assert.throws(() => netReplacement(s, [{ ...notes[0], fiscal: true }]));
  assert.throws(() =>
    netReplacement(s, [
      {
        ...notes[0],
        detail: [{ id: "missing", quantity: 5, subtotal: 97584.3 }],
      },
    ]),
  );
});
