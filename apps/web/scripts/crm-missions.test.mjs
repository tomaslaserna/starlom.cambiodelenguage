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

test("muestra de inmediato solo el presupuesto mas reciente de cada prospecto vigente", () => {
  const missions = buildCrmMissions({
    clients: emptyClients,
    leads: [],
    quotes: {
      vigentes: [
        { id: "quote-old", clientId: null, quoteNumber: "P-0130", clientName: "Espacio O2", total: 1000, issueDate: "2026-11-24", expirationDate: "2026-12-09", daysRemaining: 12, status: "pendiente", approvedThisMonth: false },
        { id: "quote-new", clientId: null, quoteNumber: "P-0133", clientName: "  ESPÁCIO   O2 ", total: 1500, issueDate: "2026-11-26", expirationDate: "2026-12-11", daysRemaining: 14, status: "pendiente", approvedThisMonth: false },
        { id: "quote-other", clientId: null, quoteNumber: "P-0134", clientName: "Hotel Centro", total: 900, issueDate: "2026-11-27", expirationDate: "2026-12-12", daysRemaining: 15, status: "pendiente", approvedThisMonth: false },
        { id: "quote-customer", clientId: "11111111-1111-4111-8111-111111111111", quoteNumber: "P-0135", clientName: "Cliente registrado", total: 2000, issueDate: "2026-11-27", expirationDate: "2026-12-12", daysRemaining: 15, status: "pendiente", approvedThisMonth: false },
      ],
      por_vencer: [],
      vencidos: [],
      aceptados: [],
    },
    today: "2026-11-27",
  });

  assert.deepEqual(
    missions.filter((mission) => mission.kind === "presupuesto").map((mission) => mission.id).sort(),
    ["quote-quote-new", "quote-quote-other"],
  );
  assert.equal(missions.find((mission) => mission.id === "quote-quote-new")?.urgency, "proximo");
  assert.match(missions.find((mission) => mission.id === "quote-quote-new")?.reason ?? "", /próximo contacto/i);
});

test("un prospecto presupuestado permanece oculto hasta la fecha de recontacto", () => {
  const quote = { id: "quote-new", clientId: null, quoteNumber: "P-0133", clientName: "Espacio O2", total: 1500, issueDate: "2026-11-26", expirationDate: "2026-12-11", daysRemaining: 14, status: "pendiente", approvedThisMonth: false };
  const input = {
    clients: emptyClients,
    leads: [],
    quotes: { vigentes: [quote], por_vencer: [], vencidos: [], aceptados: [] },
    missionStates: {
      "quote-quote-new": {
        missionKey: "quote-quote-new",
        lastCompletedAt: "2026-11-27T12:00:00Z",
        nextFollowupOn: "2027-01-25",
        purchaseAfterCompletion: false,
      },
    },
  };

  assert.equal(buildCrmMissions({ ...input, today: "2027-01-24" }).length, 0);
  assert.equal(buildCrmMissions({ ...input, today: "2027-01-25" })[0]?.id, "quote-quote-new");
});
