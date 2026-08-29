import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const source = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/read-model.ts"), "utf8");

test("el read model no expone una ruta ni usa el cliente Supabase del navegador", () => {
  assert.doesNotMatch(source, /createClient\s*\(/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_/);
  assert.match(source, /queryWithCompanyContext/);
  assert.match(source, /normalizedOrderStatusSql/);
});

test("todas las consultas quedan acotadas por empresa", () => {
  assert.match(source, /c\.empresa_id = \$2/);
  assert.match(source, /s\.empresa_id = \$1/);
  assert.match(source, /si\.empresa_id = s\.empresa_id/);
});

test("el vendedor recibe un filtro de propiedad antes de leer datos", () => {
  assert.match(source, /normalizeRole\(session\.role\) !== "vendedor"/);
  assert.match(source, /sellerCandidates\(session\)/);
  assert.match(source, /assigned_seller/);
});

test("el módulo experimental no contiene escrituras SQL", () => {
  const sqlMutations = source.match(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/g) ?? [];
  assert.deepEqual(sqlMutations, []);
});

test("el agente usa herramientas tipadas, de servidor y solo lectura", () => {
  const tools = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/tools.ts"), "utf8");
  const agent = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/agent.ts"), "utf8");
  assert.match(tools, /import "server-only"/);
  assert.match(tools, /inputSchema:/);
  assert.match(agent, /Nunca inventes datos/);
  assert.match(agent, /solo lectura/);
  assert.match(agent, /traductor de pedidos/);
  assert.match(agent, /Confianza alta\|media\|baja/);
  assert.match(agent, /1x5 lt/);
  assert.match(agent, /"Folex" suele referirse a LAMINA AD/);
  assert.match(tools, /getCustomerProductPattern/);
  assert.match(tools, /summarizeCustomerProductPatterns/);
  assert.match(tools, /getWorkPriorities/);
  assert.match(tools, /getSalesMetrics/);
  assert.match(tools, /getCustomerAccountBalance/);
  assert.match(tools, /getSupervisorCustomerBalances/);
  assert.match(tools, /getCustomerInvoices/);
  assert.match(tools, /getInvoiceByNumber/);
  assert.match(tools, /getSupervisorCustomerInvoices/);
  assert.match(tools, /getSupervisorInvoiceByNumber/);
  assert.match(tools, /getErpGuide/);
  assert.match(tools, /searchCompanyManual/);
  assert.match(tools, /getCleaningAdvice/);
  assert.match(tools, /searchSupervisorCatalogForCleaning/);
  assert.match(agent, /Nunca recomiendes mezclar lavandina\/hipoclorito/);
  assert.match(agent, /Sos LA TIRRA ia\.1\.1/);
  assert.match(tools, /executedCalls/);
  assert.match(agent, /toolChoice: "none"/);
  assert.doesNotMatch(agent, /activeTools: \[\]/);
  assert.match(tools, /employeeName/);
  assert.match(tools, /resolvePrioritySession/);
  assert.match(tools, /Solo un administrador puede consultar las prioridades de otro empleado/);
  assert.match(agent, /No repitas una herramienta/);
  assert.doesNotMatch(`${tools}\n${agent}`, /INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i);
});

test("la ruta experimental exige sesion, configuracion y limites", () => {
  const route = fs.readFileSync(path.join(root, "src/app/api/supervisor-lab/chat/route.ts"), "utf8");
  const availability = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/availability.ts"), "utf8");
  const guard = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/request-guard.ts"), "utf8");
  assert.match(route, /requireApiSession\(\)/);
  assert.match(route, /assertSupervisorAiConfigured\(\)/);
  assert.match(route, /createAgentUIStreamResponse/);
  assert.match(route, /timeout: \{ totalMs: 28_000 \}/);
  assert.match(route, /Supervisor request started/);
  assert.match(route, /Supervisor request completed/);
  assert.match(availability, /SUPERVISOR_AI_ENABLED/);
  assert.match(availability, /AI_GATEWAY_API_KEY/);
  assert.match(availability, /process\.env\.VERCEL === "1"/);
  assert.match(availability, /supervisorAiHasCredentials/);
  assert.match(guard, /MAX_MESSAGES = 30/);
  assert.match(guard, /MAX_BODY_CHARACTERS = 60_000/);
});

test("la conversación se conserva 48 horas por empresa y operador", () => {
  const route = read("src/app/api/supervisor-lab/chat/route.ts");
  const memory = read("src/lib/supervisor-lab/chat-memory.ts");
  const chat = read("src/app/supervisor-lab/supervisor-chat.tsx");
  const migration = read("../../supabase/migrations/20260827120000_supervisor_chat_memory.sql");

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /originalMessages: uiMessages/);
  assert.match(route, /onEnd: async \(\{ messages \}\)/);
  assert.match(memory, /SUPERVISOR_MEMORY_HOURS = 48/);
  assert.match(memory, /SUPERVISOR_MEMORY_MAX_MESSAGES = 200/);
  assert.match(memory, /empresa_id = \$1/);
  assert.match(memory, /user_id = \$2::uuid/);
  assert.match(memory, /expires_at <= NOW\(\)/);
  assert.match(memory, /pg_advisory_xact_lock/);
  assert.match(chat, /method: "DELETE"/);
  assert.match(chat, /messages\.slice\(-30\)/);
  assert.match(chat, /Recuperando tu conversación de las últimas 48 horas/);
  assert.match(migration, /INTERVAL '48 hours'/);
  assert.match(migration, /UNIQUE \(empresa_id, user_id, message_id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});

test("la pantalla queda oculta y usa el transporte actual del AI SDK", () => {
  const page = fs.readFileSync(path.join(root, "src/app/supervisor-lab/page.tsx"), "utf8");
  const chat = fs.readFileSync(path.join(root, "src/app/supervisor-lab/supervisor-chat.tsx"), "utf8");
  const agent = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/agent.ts"), "utf8");
  const navigation = fs.readFileSync(path.join(root, "src/lib/navigation.ts"), "utf8");
  assert.match(page, /await connection\(\)/);
  assert.match(page, /if \(!supervisorAiEnabled\(\)\) notFound\(\)/);
  assert.match(page, /requireStaffSession\(\)/);
  assert.match(page, /getSupervisorLandingSummary\(session\)/);
  assert.match(page, /<PersonalizedOverview summary=\{summary\}/);
  assert.doesNotMatch(page, /SupervisorTaskInbox/);
  assert.doesNotMatch(page, /supervisorTasksEnabled/);
  assert.match(chat, /DefaultChatTransport<StarlimSupervisorMessage>/);
  assert.match(chat, /sendMessage\(\{ text: value \}\)/);
  assert.match(chat, /quickPrompts\.map/);
  assert.match(chat, /32_000/);
  assert.match(chat, /La consulta superó los 32 segundos/);
  assert.match(chat, /<MessageResponse[^>]*>\{part\.text\}<\/MessageResponse>/);
  assert.match(chat, /Preguntame sobre el sistema/);
  assert.match(chat, /Preguntame cómo trabajamos/);
  assert.match(chat, /Pedime una solución de limpieza/);
  assert.match(chat, /Pedime ayuda para responder/);
  assert.match(chat, /Shift \+ Enter para otra línea/);
  assert.match(chat, /id="tirra-conversation"/);
  assert.match(chat, /h-\[900px\]/);
  assert.match(chat, /sm:h-\[980px\]/);
  assert.match(chat, /lg:h-\[1080px\]/);
  assert.match(chat, /rows=\{2\}/);
  assert.match(chat, /Ampliar lectura/);
  assert.match(chat, /fixed inset-3/);
  assert.match(chat, /Escape/);
  assert.match(chat, /scrollIntoView/);
  assert.doesNotMatch(chat, /dangerouslySetInnerHTML/);
  assert.match(navigation, /href: "\/supervisor-lab"/);
  assert.match(navigation, /groupByLabel\("LA TIRRA ia\.1\.1"\)/);
  assert.match(page, /title="LA TIRRA ia\.1\.1"/);
  assert.match(chat, /LA TIRRA ia\.1\.1/);
  assert.match(agent, /Sos LA TIRRA ia\.1\.1/);
});

test("LA TIRRA 1.1 consulta manual y conocimiento seguro de limpieza", () => {
  const manual = read("src/lib/supervisor-lab/company-manual.ts");
  const cleaning = read("src/lib/supervisor-lab/cleaning-knowledge.ts");
  const tools = read("src/lib/supervisor-lab/tools.ts");
  const readModel = read("src/lib/supervisor-lab/read-model.ts");

  assert.match(manual, /Ciclo de pedidos, entrega y venta/);
  assert.match(manual, /Recepción de compras a proveedores/);
  assert.match(manual, /Presupuestos y conversión a pedido/);
  assert.match(cleaning, /Nunca mezclar lavandina\/hipoclorito con ácidos, amoníaco, alcohol/);
  assert.match(cleaning, /sangre y fluidos biológicos/);
  assert.match(cleaning, /clarifyingQuestions/);
  assert.match(tools, /catalogClarification/);
  assert.match(readModel, /p\.active = TRUE/);
  assert.match(readModel, /stock_movements/);
  assert.doesNotMatch(`${manual}\n${cleaning}\n${tools}`, /INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i);
});

test("el supervisor resuelve métricas mensuales con una consulta agregada y enlaces verificables", () => {
  const tools = read("src/lib/supervisor-lab/tools.ts");
  const readModel = read("src/lib/supervisor-lab/read-model.ts");
  const guide = read("src/lib/supervisor-lab/system-guide.ts");

  assert.match(readModel, /getSupervisorSalesMetrics/);
  assert.match(readModel, /getSupervisorCustomerBalances/);
  assert.match(readModel, /activeAccountMovementWhereSql/);
  assert.match(readModel, /getSupervisorCustomerInvoices/);
  assert.match(readModel, /getSupervisorInvoiceByNumber/);
  assert.match(readModel, /fiscal_receipt_type IN \(1, 6, 11\)/);
  assert.match(readModel, /\/api\/pdfs\/fiscal\/sales\/\$\{row\.sale_id\}/);
  assert.match(readModel, /monthRange\(requestedPeriod\)/);
  assert.match(readModel, /netSalesAmountSql/);
  assert.match(readModel, /normalizedOrderStatusSql\("s"\).*'entregado'/s);
  assert.match(tools, /Registro de ventas/);
  assert.match(tools, /Rentabilidad/);
  assert.match(guide, /payments\/accounts/);
  assert.match(guide, /Abrí Administración > Cuentas corrientes/);
});

test("el perfil personalizado llega al tablero y a las instrucciones del agente", () => {
  const landing = read("src/lib/supervisor-lab/landing-summary.ts");
  const overview = read("src/app/supervisor-lab/personalized-overview.tsx");
  const route = read("src/app/api/supervisor-lab/chat/route.ts");
  const agent = read("src/lib/supervisor-lab/agent.ts");

  assert.match(landing, /profileLabel/);
  assert.match(landing, /Vendedor principal/);
  assert.match(landing, /Administrativo auxiliar/);
  assert.match(overview, /Perfil: \{summary\.profileLabel\}/);
  assert.match(route, /createStarlimSupervisorAgent\(session, summary\)/);
  assert.match(agent, /Perfil actual: \$\{summary\.profileLabel\}/);
  assert.match(agent, /Prioriza seguimiento de clientes/);
  assert.match(agent, /Prioriza facturas solicitadas/);
});

test("las tareas persistentes quedan aisladas por empresa y usuario", () => {
  const store = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/task-store.ts"), "utf8");
  const taskRoute = fs.readFileSync(path.join(root, "src/app/api/supervisor-lab/tasks/[id]/route.ts"), "utf8");
  assert.match(store, /SUPERVISOR_TASKS_ENABLED/);
  assert.match(store, /empresa_id = \$2/);
  assert.match(store, /assignee_id = \$3::uuid/);
  assert.match(store, /status IN \('open', 'snoozed'\)/);
  assert.match(taskRoute, /z\.enum\(\["done", "dismiss", "snooze"\]\)/);
  assert.match(taskRoute, /requireApiSession\(\)/);
});

test("la generacion determinista usa deduplicacion estable y no ejecuta acciones operativas", () => {
  const rules = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/task-rules.ts"), "utf8");
  const store = fs.readFileSync(path.join(root, "src/lib/supervisor-lab/task-store.ts"), "utf8");
  assert.match(rules, /order_approval:\$\{order\.id\}/);
  assert.match(rules, /fiscal_decision:\$\{sale\.id\}/);
  assert.match(store, /ON CONFLICT \(empresa_id, assignee_id, dedupe_key\)/);
  assert.doesNotMatch(`${rules}\n${store}`, /UPDATE\s+(sales|stock|sale_items|customer_accounts)/i);
});

test("la bandeja exige una accion humana para cambiar el estado", () => {
  const inbox = fs.readFileSync(path.join(root, "src/app/supervisor-lab/task-inbox.tsx"), "utf8");
  assert.match(inbox, /onClick=\{\(\) => update\(task\.id, "done"\)\}/);
  assert.match(inbox, /onClick=\{\(\) => update\(task\.id, "snooze"\)\}/);
  assert.match(inbox, /onClick=\{\(\) => update\(task\.id, "dismiss"\)\}/);
  assert.doesNotMatch(inbox, /useEffect\(\(\) => \{[^}]*method: "PATCH"/);
});
