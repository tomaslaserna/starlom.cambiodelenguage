import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmMissions } from "../src/lib/crm-missions.ts";

const emptyClients = {
  groups: { al_dia: [], contactar: [], riesgo: [], perdido: [], sin_historial: [] },
  counts: {},
  zonas: [],
};

const lead = (overrides = {}) => ({
  id: "lead-1",
  name: "Nuevo",
  phone: "3515555555",
  email: "",
  locality: "",
  source: "Web",
  stage: "nuevo",
  nextFollowup: "2026-10-21",
  notes: "",
  assignedSeller: "Lucas",
  convertedClientId: null,
  createdAt: "2026-10-20",
  businessSegment: "",
  contactedToday: false,
  lastContactAt: null,
  ...overrides,
});

test("prioriza prospectos pendientes y excluye presupuestos vencidos hace mucho", () => {
  const missions = buildCrmMissions({
    clients: emptyClients,
    leads: [lead()],
    quotes: {
      vigentes: [],
      por_vencer: [],
      aceptados: [],
      vencidos: [
        { id: "quote-recent", quoteNumber: "P-2", clientName: "Cliente reciente", total: 1000, issueDate: "2026-10-01", expirationDate: "2026-10-18", daysRemaining: -3, status: "pendiente", approvedThisMonth: false },
        { id: "quote-old", quoteNumber: "P-1", clientName: "Cliente viejo", total: 1000, issueDate: "2026-09-01", expirationDate: "2026-09-10", daysRemaining: -41, status: "pendiente", approvedThisMonth: false },
      ],
    },
  });

  assert.equal(missions[0].kind, "lead");
  assert.ok(missions.some((mission) => mission.id === "quote-overdue-quote-recent"));
  assert.ok(!missions.some((mission) => mission.id === "quote-overdue-quote-old"));
  assert.match(missions[0].href, /lead-1/);
});

test("no vuelve a sugerir un lead ya contactado hoy", () => {
  const missions = buildCrmMissions({
    clients: emptyClients,
    leads: [lead({ contactedToday: true, lastContactAt: "2026-10-21" })],
    quotes: { vigentes: [], por_vencer: [], vencidos: [], aceptados: [] },
  });
  assert.equal(missions.length, 0);
});

test("una lista compartida se convierte en misión cuando llega su fecha", () => {
  const missions = buildCrmMissions({
    clients: emptyClients,
    leads: [],
    quotes: { vigentes: [], por_vencer: [], vencidos: [], aceptados: [] },
    priceListSignals: [{
      id: "share-1",
      priceListId: 3,
      priceListName: "L2 - ANCLA",
      recipientType: "prospecto",
      recipientName: "Hotel Centro",
      recipientPhone: "3515555555",
      purpose: "Primera propuesta",
      followUpOn: "2026-10-21",
      sharedAt: "2026-10-14T12:00:00Z",
    }],
  });

  assert.equal(missions[0].kind, "lista");
  assert.equal(missions[0].priceListSignalId, "share-1");
  assert.match(missions[0].reason, /L2 - ANCLA.*Primera propuesta/);
});
