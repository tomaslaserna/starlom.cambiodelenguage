import assert from "node:assert/strict";
import http from "node:http";
import { fork } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

process.env.ARCA_LAB_SCHEMA = "arca_lab_" + randomBytes(6).toString("hex");
const { pool } = await import("./local-db.mjs");
const official = process.argv.includes("--official");
if (official && process.env.ARCA_HOMO_POS !== "2") throw new Error("El ensayo está preparado para el punto 2 de homologación");
const gateway = official ? await import("./official.mjs") : null;
const requestPath = "/wsfe/" + randomBytes(24).toString("hex");
const approvalsLimit = 2;
let requested = 0;
const invoices = [];
const calls = [];
const children = new Set();
let cutAfterApproval = false;
let heldResponse;
let holdApproval = false;

function tag(body, name) {
  const match = body.match(new RegExp("<" + name + ">([^<]*)</" + name + ">"));
  assert.ok(match, "Campo SOAP ausente: " + name);
  return match[1];
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url !== requestPath || req.method !== "POST") { res.writeHead(404).end(); return; }
    let body = "";
    for await (const part of req) body += part;
    const method = req.headers.soapaction?.split("/").pop();
    const call = { method };
    calls.push(call);
    if (official) {
      if (method === "FECAESolicitar") {
        assert.ok(++requested <= approvalsLimit);
        assert.equal(tag(body,"CbteTipo"),"1");
        assert.equal(tag(body,"ImpTotal"),"121.00");
        assert.equal(tag(body,"DocNro"),"30000000007");
      }
      const upstream = await gateway.sendTestingSoap(method, body);
      if (method === "FECompConsultar") call.number = Number(tag(body,"CbteNro"));
      if (method === "FECAESolicitar") {
        call.number = Number(tag(body,"CbteDesde"));
        const cae = upstream.match(/<CAE>([0-9]{14})<\/CAE>/)?.[1];
        if (!cae) console.log("Respuesta fiscal de homologación", [...upstream.matchAll(/<(Code|Msg)>([^<]+)</g)].map(m=>m[2]).join(" "));
        if (cae && tag(upstream,"Resultado")==="A") {
          invoices.push({number:call.number,cae});
          if (cutAfterApproval) { cutAfterApproval=false; req.socket.destroy(); return; }
          if (holdApproval) { holdApproval=false; await new Promise(resolve=>{heldResponse=resolve;}); }
        }
      }
      res.setHeader("Content-Type","text/xml");
      res.end(upstream);
      return;
    }
    let result;
    if (method === "FECompUltimoAutorizado") {
      result = "<CbteNro>" + invoices.length + "</CbteNro>";
    } else if (method === "FECAESolicitar") {
      const number = Number(tag(body, "CbteDesde"));
      call.number = number;
      assert.equal(number, invoices.length + 1, "Número fuera de secuencia");
      assert.equal(tag(body, "PtoVta"), "2");
      assert.equal(tag(body, "CbteTipo"), "1");
      const invoice = { number, cae: String(99000000000000 + number), date: tag(body, "CbteFch"),
        doc: tag(body, "DocNro"), gross: tag(body, "ImpTotal") };
      invoices.push(invoice);
      result = "<FECAEDetResponse><Resultado>A</Resultado><CbteDesde>" + number +
        "</CbteDesde><CAE>" + invoice.cae + "</CAE><CAEFchVto>20261231</CAEFchVto></FECAEDetResponse>";
      if (cutAfterApproval) {
        cutAfterApproval = false;
        req.socket.destroy();
        return;
      }
      if (holdApproval) {
        holdApproval = false;
        await new Promise(resolve => { heldResponse = resolve; });
      }
    } else if (method === "FECompConsultar") {
      call.number = Number(tag(body, "CbteNro"));
      const found = invoices.find(r => r.number === call.number);
      assert.ok(found);
      result = "<ResultGet><Resultado>A</Resultado><CbteDesde>" + found.number + "</CbteDesde><CodAutorizacion>" +
        found.cae + "</CodAutorizacion><DocNro>" + found.doc + "</DocNro><ImpTotal>" + found.gross +
        "</ImpTotal><FchVto>20261231</FchVto><CbteFch>" + found.date + "</CbteFch></ResultGet>";
    } else {
      throw new Error("Operación inesperada: " + method);
    }
    res.setHeader("Content-Type", "text/xml");
    res.end("<Envelope><Body><" + method + "Response><" + method + "Result>" + result + "</" +
      method + "Result></" + method + "Response></Body></Envelope>");
  } catch (error) {
    res.writeHead(500).end("<Fault><faultstring>" + error.message + "</faultstring></Fault>");
  }
});

async function waitUntil(check, description) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(40);
  }
  throw new Error("Se agotó la espera de " + description);
}

function operator(sale, variant, name) {
  const child = fork(fileURLToPath(new URL("./operator.mjs", import.meta.url)), [], {
    stdio: ["ignore","ignore","pipe","ipc"],
    env: {
      SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_NO_WARNINGS:"1",
      ARCA_LAB_SCHEMA:process.env.ARCA_LAB_SCHEMA,ARCA_LAB_PGPORT:process.env.ARCA_LAB_PGPORT,
      ARCA_LAB_PGPASSWORD:process.env.ARCA_LAB_PGPASSWORD, ARCA_LAB_OPERATOR:name,
      ARCA_LAB_SALE:sale, ARCA_LAB_VARIANT:variant, ARCA_LAB_WSFE:"http://127.0.0.1:" + server.address().port + requestPath,
    },
  });
  children.add(child);
  let reply, stderr = "";
  child.on("message", message => { reply = message; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const completion = once(child, "exit").then(([code]) => {
    children.delete(child);
    assert.equal(code, 0, stderr);
    assert.ok(reply);
    return reply;
  });
  // The concurrency scenario also observes the worker from PostgreSQL before awaiting its result.
  completion.catch(() => {});
  return completion;
}

async function createSale() {
  const id = randomUUID(), clientId = randomUUID();
  await pool.query("INSERT INTO clients VALUES($1,1,'Cliente de ensayo','30000000007','Responsable Inscripto')", [clientId]);
  await pool.query("INSERT INTO sales(id,empresa_id,client_id,total_amount,vat_rate,desired_document,order_status,receipt_type) VALUES($1,1,$2,121,21,'factura_a','entregado',1)", [id,clientId]);
  await pool.query("INSERT INTO sale_items(sale_id,empresa_id,quantity,unit_price,total_amount,description) VALUES($1,1,1,100,100,'Producto de ensayo')", [id]);
  return id;
}

async function state(sale) {
  const { rows } = await pool.query("SELECT fiscal_status, fiscal_receipt_number, cae FROM sales WHERE id=$1", [sale]);
  return rows[0];
}

async function lostResponse(variant) {
  const sale = await createSale(), first = invoices.length, start = calls.length;
  cutAfterApproval = true;
  const initial = await operator(sale, variant, "operador-a");
  assert.equal(initial.status, "error", JSON.stringify(initial));
  assert.match(initial.message, /FECAESolicitar/);
  assert.equal(invoices.length, first + 1);
  const intermediate = await state(sale);
  assert.equal(intermediate.fiscal_status,"error");
  assert.ok(!intermediate.cae);
  const retry = await operator(sale, variant, "operador-b");
  assert.equal(retry.status, "ok", JSON.stringify(retry));
  assert.notEqual(retry.pid, initial.pid);
  const sequence = calls.slice(start);
  const recovery = sequence.filter(c => c.method === "FECompConsultar");
  const expected = variant === "protected" ? 1 : 2;
  assert.equal(invoices.length - first, expected);
  assert.equal(sequence.filter(c => c.method === "FECAESolicitar").length, expected);
  assert.deepEqual(recovery.map(c=>c.number), variant === "protected" ? [invoices[first].number] : []);
  const final = await state(sale);
  assert.equal(final.fiscal_status,"aprobado");
  assert.equal(final.cae,retry.cae);
  assert.equal(final.fiscal_receipt_number,retry.number);
  assert.equal(final.cae === invoices[first].cae, variant === "protected");
  console.log(JSON.stringify({scenario:"lost-response",variant,approvals:expected,initial:intermediate.fiscal_status,
    recoveredOriginal: final.cae === invoices[first].cae, final: final.fiscal_status, calls:sequence}));
}

async function simultaneous(variant) {
  const sale = await createSale(), start = calls.length;
  holdApproval = true;
  const first = operator(sale, variant, "operador-a");
  await Promise.race([waitUntil(()=>Boolean(heldResponse), "la primera autorización"),first.then(r=>{throw new Error(JSON.stringify(r));})]);
  const second = operator(sale, variant, "operador-b");
  if (variant === "protected") {
    await waitUntil(async () => {
      const { rows } = await pool.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='operador-b' AND cardinality(pg_blocking_pids(pid))>0) AS waiting");
      return rows[0].waiting;
    }, "la espera real del segundo operador en Postgres");
  } else {
    // El primer operador sigue dentro de su petición. El segundo ya puede obtener otro número.
    const overlapping = await second;
    assert.equal(overlapping.status, "ok", JSON.stringify(overlapping));
  }
  heldResponse();
  heldResponse = null;
  const [a,b] = await Promise.all([first,second]);
  assert.equal(a.status,"ok", JSON.stringify(a));
  assert.equal(b.status,"ok", JSON.stringify(b));
  assert.notEqual(a.pid,b.pid);
  const protectedRun = variant === "protected";
  const expected = protectedRun ? 1 : 2;
  assert.equal(a.number === b.number, protectedRun);
  assert.equal(a.cae === b.cae, protectedRun);
  assert.equal(calls.slice(start).filter(c=>c.method==="FECAESolicitar").length,expected);
  const final = await state(sale);
  assert.equal(final.cae,a.cae);
  assert.equal(final.fiscal_status,"aprobado");
  const audit = await pool.query("SELECT count(*)::int AS approvals FROM audit_log WHERE action='fiscal.invoice_approved' AND entity_id=$1", [sale]);
  assert.equal(audit.rows[0].approvals,expected);
  console.log(JSON.stringify({scenario:"simultaneous",variant,blockedObserved:protectedRun,operators:2,sameCae:a.cae === b.cae,
    approvalsInERP:audit.rows[0].approvals, calls:calls.slice(start)}));

}

try {
  await pool.query("CREATE SCHEMA " + process.env.ARCA_LAB_SCHEMA);
  await pool.query("CREATE SCHEMA IF NOT EXISTS starlim_arca");
  const migration = await readFile(new URL("../../../../supabase/migrations/20261126183351_reserve_arca_invoice_number.sql", import.meta.url), "utf8");
  await pool.query(migration.split("REVOKE")[0].replaceAll("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "));
  await pool.query("DELETE FROM starlim_arca.invoice_attempts WHERE mode='testing' AND issuer=30000000007");
  await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  await lostResponse("protected");
  await simultaneous("protected");
} finally {
  heldResponse?.();
  for (const child of children) child.kill();
  server.closeAllConnections();
  server.close();
  await pool.end();
}
