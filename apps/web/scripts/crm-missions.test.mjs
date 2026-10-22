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
        { id: "quote-recent", clientId: null, quoteNumber: "P-2", clientName: "Cliente reciente", total: 1000, issueDate: "2026-10-01", expirationDate: "2026-10-18", daysRemaining: -3, status: "pendiente", approvedThisMonth: false },
        { id: "quote-old", clientId: null, quoteNumber: "P-1", clientName: "Cliente viejo", total: 1000, issueDate: "2026-09-01", expirationDate: "2026-09-10", daysRemaining: -41, status: "pendiente", approvedThisMonth: false },
      ],
    },
  });

  assert.equal(missions[0].kind, "lead");
  assert.ok(missions.some((mission) => mission.id === "quote-quote-recent"));
  assert.ok(!missions.some((mission) => mission.id === "quote-quote-old"));
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
      customerId: null,
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

test("una misión realizada permanece oculta hasta su fecha de recontacto", () => {
  const customerId = "11111111-1111-4111-8111-111111111111";
  const clients = {
    groups: {
      ...emptyClients.groups,
      contactar: [{
        customerId,
        customerName: "Cantina",
        phone: "3515555555",
        zona: "Córdoba",
        relation: "propio",
        daysSinceLastPurchase: 12,
        averageDays: 7,
        expectedNextPurchase: "2026-10-20",
        lastPurchase: "2026-10-10",
      }],
    },
    counts: { contactar: 1 },
    zonas: ["Córdoba"],
  };
  const input = {
    clients,
    leads: [],
    quotes: { vigentes: [], por_vencer: [], vencidos: [], aceptados: [] },
    missionStates: {
      [`client-${customerId}`]: {
        missionKey: `client-${customerId}`,
        lastCompletedAt: "2026-10-22T12:00:00Z",
        nextFollowupOn: "2026-10-29",
        purchaseAfterCompletion: false,
      },
    },
  };

  assert.equal(buildCrmMissions({ ...input, today: "2026-10-28" }).length, 0);
  const recurring = buildCrmMissions({ ...input, today: "2026-10-29" });
  assert.equal(recurring.length, 1);
  assert.equal(recurring[0].completedBefore, true);
});

test("una compra posterior cancela el recontacto programado", () => {
  const customerId = "22222222-2222-4222-8222-222222222222";
  const missions = buildCrmMissions({
    clients: {
      groups: {
        ...emptyClients.groups,
        riesgo: [{ customerId, customerName: "Cantina", phone: "", zona: "Córdoba", relation: "propio", daysSinceLastPurchase: 20, averageDays: 7, expectedNextPurchase: null, lastPurchase: "2026-10-01" }],
      },
      counts: { riesgo: 1 },
      zonas: ["Córdoba"],
    },
    leads: [],
    quotes: { vigentes: [], por_vencer: [], vencidos: [], aceptados: [] },
    missionStates: {
      [`client-${customerId}`]: {
        missionKey: `client-${customerId}`,
        lastCompletedAt: "2026-10-15T12:00:00Z",
        nextFollowupOn: "2026-10-22",
        purchaseAfterCompletion: true,
      },
    },
    today: "2026-10-22",
  });
  assert.equal(missions.length, 0);
});
