import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("LA TIRRA exige permiso CRM tanto en la pantalla como en la API", () => {
  const page = read("src/app/supervisor-lab/page.tsx");
  const route = read("src/app/api/supervisor-lab/chat/route.ts");

  assert.match(page, /requirePagePermission\(session, \[CRM_READ_PERMISSION\]\)/);
  assert.match(route, /requireSupervisorReadPermission/);
  assert.match(route, /sessionAllows\(session, \[CRM_READ_PERMISSION\]\)/);
  assert.match(route, /No tenés permiso para consultar LA TIRRA ia\.1\.1/);
});

test("las respuestas de consulta enseñan cómo verificar el dato y no inventan fuentes", () => {
  const agent = read("src/lib/supervisor-lab/agent.ts");
  const contract = read("src/lib/supervisor-lab/response-contract.ts");
  const chat = read("src/app/supervisor-lab/supervisor-chat.tsx");

  assert.match(agent, /SUPERVISOR_RESPONSE_CONTRACT/);
  assert.match(contract, /### Qué significa/);
  assert.match(contract, /### Cómo verificarlo/);
  assert.match(contract, /### Fuente/);
  assert.match(contract, /No inventes rutas ni enlaces/);
  assert.match(chat, /Solo lectura · no autorizo, facturo, cobro ni modifico datos por vos/);
  assert.match(chat, /te muestro cómo verificarlo vos/);
});

test("la fuente de ventas aplica el mismo mes que la métrica consultada", () => {
  const salesPage = read("src/app/sales/page.tsx");
  const orders = read("src/lib/orders.ts");
  const salesAdmin = read("src/lib/sales-admin.ts");
  const tools = read("src/lib/supervisor-lab/tools.ts");

  assert.match(salesPage, /name="month"/);
  assert.match(salesPage, /getSalesSummary\(session\.companyId, selectedMonth\)/);
  assert.match(salesPage, /month: selectedMonth/);
  assert.match(orders, /s\.sale_date >= .*s\.sale_date </);
  assert.match(salesAdmin, /\^\\d\{4\}-\\d\{2\}\$/);
  assert.match(tools, /href: metrics\.sourceHref/);
  assert.match(tools, /no debe compararse como si fuera la misma métrica que el neto de Rentabilidad/);
});

test("el historial de LA TIRRA se compacta antes de viajar o guardarse", () => {
  const chat = read("src/app/supervisor-lab/supervisor-chat.tsx");
  const route = read("src/app/api/supervisor-lab/chat/route.ts");
  const memory = read("src/lib/supervisor-lab/chat-memory.ts");
  const compact = read("src/lib/supervisor-lab/message-compact.ts");

  assert.match(chat, /compactSupervisorMessages\(messages\.slice\(-30\)\)/);
  assert.match(route, /compactSupervisorMessages\(\s*parseSupervisorRequestBody/s);
  assert.match(memory, /return compactSupervisorMessages\(/);
  assert.match(memory, /return compactSupervisorMessages\(\s*result\.rows/s);
  assert.match(compact, /SUPERVISOR_CHAT_CONTEXT_MAX_MESSAGES = 12/);
  assert.match(compact, /SUPERVISOR_CHAT_MESSAGE_MAX_CHARACTERS = 2_500/);
  assert.match(compact, /parts: \[\{ type: "text", text \}\]/);
  assert.match(compact, /nunca deben volver al navegador ni a la siguiente petición/);
});
