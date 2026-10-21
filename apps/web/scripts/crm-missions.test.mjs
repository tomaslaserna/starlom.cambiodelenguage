import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmMissions } from "../src/lib/crm-missions.ts";

const emptyClients = {
  groups: { al_dia: [], contactar: [], riesgo: [], perdido: [], sin_historial: [] },
  counts: {},
  zonas: [],
};

test("prioriza acciones comerciales urgentes antes que cobranzas", () => {
  const missions = buildCrmMissions({
    clients: emptyClients,
    leads: [{ id: "lead-1", name: "Nuevo", phone: "3515555555", email: "", locality: "", source: "Web", stage: "nuevo", nextFollowup: "2026-10-21", notes: "", assignedSeller: "Lucas", convertedClientId: null, createdAt: "2026-10-20", businessSegment: "", contactedToday: false, lastContactAt: null }],
    quotes: {
      vigentes: [], por_vencer: [], aceptados: [],
      vencidos: [{ id: "quote-1", quoteNumber: "P-1", clientName: "Cliente", total: 1000, issueDate: "2026-10-01", expirationDate: "2026-10-10", daysRemaining: -11, status: "pendiente", approvedThisMonth: false }],
    },
    accounts: [{ clientId: "client-1", name: "Deudor", sellerName: "", taxId: "", lastMovementDate: null, balance: 5000, aging: {} }],
  });

  assert.equal(missions[0].kind, "lead");
  assert.equal(missions[1].kind, "presupuesto");
  assert.equal(missions.at(-1).kind, "cobro");
  assert.match(missions[0].href, /lead-1/);
});

test("no vuelve a sugerir un lead ya contactado hoy", () => {
  const missions = buildCrmMissions({
    clients: emptyClients,
    leads: [{ id: "lead-1", name: "Atendido", phone: "", email: "", locality: "", source: "", stage: "nuevo", nextFollowup: "2026-10-21", notes: "", assignedSeller: "Lucas", convertedClientId: null, createdAt: "2026-10-20", businessSegment: "", contactedToday: true, lastContactAt: "2026-10-21" }],
    quotes: { vigentes: [], por_vencer: [], vencidos: [], aceptados: [] },
    accounts: [],
  });
  assert.equal(missions.length, 0);
});
