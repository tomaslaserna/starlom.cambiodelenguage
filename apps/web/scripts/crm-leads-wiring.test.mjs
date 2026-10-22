import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../migrations/20260811000000_crm_leads.sql", import.meta.url),
  "utf8",
);

test("la migración crea crm_leads con RLS y grants a starlim_app", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.crm_leads/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FOR ALL TO starlim_app/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.crm_leads TO starlim_app/);
  assert.match(migration, /stage text NOT NULL DEFAULT 'nuevo'/);
});

const leadsSource = readFileSync(new URL("../src/lib/leads.ts", import.meta.url), "utf8");

test("leads.ts scopea por vendedor y la conversión reutiliza createCustomer", () => {
  assert.match(leadsSource, /sellerCandidates\(/);
  assert.match(leadsSource, /UPPER\(BTRIM\(COALESCE\(assigned_seller/);
  assert.match(leadsSource, /createCustomer\(/);
  assert.match(leadsSource, /stage='convertido'/);
  assert.match(leadsSource, /converted_client_id/);
});

const navSource = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");

test("navigation evita un segundo mundo CRM y expone Motor de ventas", () => {
  assert.match(navSource, /href: "\/sales-engine", label: "Motor de ventas"/);
  assert.doesNotMatch(navSource, /href: "\/crm\/leads", label: "Leads"/);
});

const activityMigration = readFileSync(
  new URL("../../../supabase/migrations/20260827032733_crm_sales_activity_tracking.sql", import.meta.url),
  "utf8",
);
const activitySource = readFileSync(new URL("../src/lib/sales-activity.ts", import.meta.url), "utf8");
const activityPanel = readFileSync(new URL("../src/app/crm/leads/sales-activity-panel.tsx", import.meta.url), "utf8");
const leadsPage = readFileSync(new URL("../src/app/crm/leads/page.tsx", import.meta.url), "utf8");
const leadsBoard = readFileSync(new URL("../src/app/crm/leads/leads-board.tsx", import.meta.url), "utf8");
const calendarPage = readFileSync(new URL("../src/app/calendar/page.tsx", import.meta.url), "utf8");
const calendarActions = readFileSync(new URL("../src/app/calendar/actions.ts", import.meta.url), "utf8");
const shellNavigation = readFileSync(new URL("../src/components/shell-navigation.tsx", import.meta.url), "utf8");
const crmCustomersPage = readFileSync(new URL("../src/app/crm/clientes/page.tsx", import.meta.url), "utf8");
const mobileNavigation = readFileSync(new URL("../src/components/seller-mobile-navigation.tsx", import.meta.url), "utf8");

test("el panel comercial persiste actividades aisladas por empresa y vendedor", () => {
  assert.match(activityMigration, /CREATE TABLE public\.crm_sales_activities/);
  assert.match(activityMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(activityMigration, /seller_id UUID NOT NULL/);
  assert.match(activitySource, /a\.seller_id = \$2::uuid/);
  assert.match(activitySource, /normalizeRole\(session\.role\) !== "vendedor"/);
  assert.match(activitySource, /while \(plan\.length < 8/);
});

test("la agenda de leads fija diez contactos y permite reprogramar cada prospecto", () => {
  assert.match(leadsSource, /getLeadFollowupAgenda/);
  assert.match(leadsSource, /LIMIT 10/);
  assert.match(leadsSource, /recordLeadContact/);
  assert.match(leadsSource, /next_followup = \$1::date/);
  assert.match(leadsBoard, /\[3, 7, 15, 30, 60\]/);
  assert.match(leadsBoard, /Guardar y sacar de hoy/);
  assert.match(leadsBoard, /Cada lead conserva una próxima acción/);
  assert.match(leadsBoard, /Sugerencia automática/);
  assert.match(leadsBoard, /Guardar y sacar de hoy/);
  assert.match(leadsSource, /leadStageAfterContact/);
  assert.match(leadsPage, /agenda=\{leadAgenda\}/);
});

test("Leads muestra círculos de progreso y conserva el embudo de prospectos", () => {
  assert.match(activityPanel, /conic-gradient/);
  assert.match(activityPanel, /Registrar contacto/);
  assert.match(activityPanel, /recuperados esta semana/);
  assert.match(leadsPage, /<SalesActivityPanel/);
  assert.match(leadsPage, /<LeadsBoard/);
  assert.match(leadsPage, /sessionCanUseCrm\(session\)/);
  assert.match(leadsPage, /isSeller \? getVendorClients/);
  assert.doesNotMatch(leadsPage, /normalizeRole\(session\.role\) !== "vendedor".*redirect/);
});

test("Leads abre su bandeja operativa antes de la actividad comercial", () => {
  assert.ok(leadsPage.indexOf("<LeadsBoard") < leadsPage.indexOf("<SalesActivityPanel"));
  assert.match(leadsBoard, /\["hoy", "Hoy"\]/);
  assert.match(leadsBoard, /\["embudo", "Embudo"\]/);
  assert.match(leadsBoard, /\["todos", "Todos"\]/);
});

test("el calendario conserva la programación de contactos sin crear una navegación paralela", () => {
  assert.doesNotMatch(shellNavigation, /CrmWorldNavigation/);
  assert.doesNotMatch(shellNavigation, /pathname\.startsWith\("\/crm"\)/);
  assert.match(calendarPage, /Leads sugeridos para contactar/);
  assert.match(calendarPage, /Leads programados/);
  assert.match(calendarPage, /name="leadId"/);
  assert.match(calendarActions, /scheduleLeadReminder/);
  assert.match(leadsSource, /export async function scheduleLeadReminder/);
});

test("las pantallas históricas siguen disponibles pero salen de la navegación principal", () => {
  assert.doesNotMatch(crmCustomersPage, /href="\/quotes|href=\{`\/customers/);
  assert.match(mobileNavigation, /href: "\/sales-engine"/);
  assert.match(crmCustomersPage, /`\/crm\/clientes\/\$\{customer\.id\}`/);
  assert.doesNotMatch(shellNavigation, /Volver al sistema/);
});
