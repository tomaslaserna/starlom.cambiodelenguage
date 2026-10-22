import type { CrmClientsResult } from "@/lib/crm";
import type { LeadFollowupAgendaItem } from "@/lib/leads";
import type { VendorQuote, QuoteBucket } from "@/lib/crm-quotes";
import type { PriceListFollowupSignal } from "@/lib/price-list-followups";
import type { SalesMissionStateMap } from "@/lib/sales-missions";

export type CrmMissionKind = "lead" | "cliente" | "presupuesto" | "lista";
export type CrmMissionUrgency = "ahora" | "hoy" | "proximo";

const SALES_ENGINE_ROLLOUT_DATE = "2026-10-15";

function missionToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type CrmMission = {
  id: string;
  kind: CrmMissionKind;
  urgency: CrmMissionUrgency;
  score: number;
  title: string;
  reason: string;
  detail: string;
  href: string;
  actionLabel: string;
  entityId: string;
  customerId?: string;
  phone?: string;
  priceListSignalId?: string;
  completedBefore?: boolean;
};

type MissionInput = {
  clients: CrmClientsResult;
  leads: LeadFollowupAgendaItem[];
  quotes: Record<QuoteBucket, VendorQuote[]>;
  priceListSignals?: PriceListFollowupSignal[];
  missionStates?: SalesMissionStateMap;
  today?: string;
};

function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.startsWith("54") ? digits : `54${digits}`;
}
export function buildCrmMissions({ clients, leads, quotes, priceListSignals = [], missionStates = {}, today = missionToday() }: MissionInput): CrmMission[] {
  const missions: CrmMission[] = [];

  for (const lead of leads.filter((item) => !item.contactedToday)) {
    missions.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      urgency: "ahora",
      score: lead.nextFollowup ? 100 : 92,
      title: `Contactar a ${lead.name}`,
      reason: lead.nextFollowup ? "El recontacto está vencido o toca hoy" : "Lead activo sin próximo paso definido",
      detail: [lead.stage, lead.locality, lead.source].filter(Boolean).join(" · ") || "Lead comercial",
      href: `/crm/leads?lead=${lead.id}`,
      actionLabel: "Abrir lead",
      entityId: lead.id,
      phone: whatsappPhone(lead.phone),
    });
  }

  for (const quote of quotes.vencidos.filter((item) => {
    // Do not revive the stale historical archive, but once a quote entered the
    // new motor it stays actionable until an operator completes the mission.
    if (item.expirationDate && item.expirationDate >= SALES_ENGINE_ROLLOUT_DATE) return true;
    const state = missionStates[`quote-${item.id}`];
    return Boolean(state && !state.purchaseAfterCompletion && state.nextFollowupOn <= today);
  })) {
    missions.push({
      id: `quote-${quote.id}`,
      kind: "presupuesto",
      urgency: "ahora",
      score: 96 + Math.min(3, Math.abs(quote.daysRemaining ?? 0)),
      title: `Reactivar ${quote.quoteNumber}`,
      reason: `Venció hace ${Math.abs(quote.daysRemaining ?? 0)} ${Math.abs(quote.daysRemaining ?? 0) === 1 ? "día" : "días"}`,
      detail: `${quote.clientName || "Cliente sin identificar"} · ${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(quote.total)}`,
      href: `/crm/presupuestos?q=${encodeURIComponent(quote.quoteNumber)}`,
      actionLabel: "Revisar presupuesto",
      entityId: quote.id,
      customerId: quote.clientId ?? undefined,
    });
  }

  for (const quote of quotes.por_vencer) {
    missions.push({
      id: `quote-${quote.id}`,
      kind: "presupuesto",
      urgency: "hoy",
      score: 90 - Math.max(0, quote.daysRemaining ?? 0),
      title: `Definir ${quote.quoteNumber}`,
      reason: quote.daysRemaining === 0 ? "El presupuesto vence hoy" : `Vence en ${quote.daysRemaining} días`,
      detail: quote.clientName || "Cliente sin identificar",
      href: `/crm/presupuestos?q=${encodeURIComponent(quote.quoteNumber)}`,
      actionLabel: "Ver oportunidad",
      entityId: quote.id,
      customerId: quote.clientId ?? undefined,
    });
  }

  for (const signal of priceListSignals) {
    missions.push({
      id: `price-list-${signal.id}`,
      kind: "lista",
      urgency: "hoy",
      score: signal.recipientType === "prospecto" ? 89 : 82,
      title: `Revisar la lista enviada a ${signal.recipientName}`,
      reason: `${signal.priceListName} · ${signal.purpose}`,
      detail: `Seguimiento previsto para ${signal.followUpOn}`,
      href: `/prices?list=${signal.priceListId}`,
      actionLabel: "Ver lista",
      entityId: signal.id,
      customerId: signal.customerId ?? undefined,
      phone: whatsappPhone(signal.recipientPhone),
      priceListSignalId: signal.id,
    });
  }

  const clientBuckets = [
    { key: "perdido", score: 86, urgency: "ahora" as const, reason: "Se alejó más del doble de su ritmo habitual" },
    { key: "riesgo", score: 78, urgency: "hoy" as const, reason: "Está fuera de su ritmo habitual de compra" },
    { key: "contactar", score: 68, urgency: "hoy" as const, reason: "Llegó su fecha estimada de recompra" },
  ];
  for (const bucket of clientBuckets) {
    for (const client of (clients.groups[bucket.key] ?? [])) {
      missions.push({
        id: `client-${client.customerId}`,
        kind: "cliente",
        urgency: bucket.urgency,
        score: bucket.score + Math.min(5, Math.max(0, client.daysSinceLastPurchase ?? 0) / 30),
        title: `${bucket.key === "perdido" ? "Recuperar" : "Recontactar"} a ${client.customerName}`,
        reason: bucket.reason,
        detail: client.daysSinceLastPurchase == null ? client.zona : `${client.daysSinceLastPurchase} días desde la última compra · ${client.zona}`,
        href: `/crm/clientes/${client.customerId}`,
        actionLabel: "Abrir ficha 360°",
        entityId: client.customerId,
        customerId: client.customerId,
        phone: whatsappPhone(client.phone),
      });
    }
  }

  return missions
    .filter((mission) => {
      const state = missionStates[mission.id];
      if (!state) return true;
      if (state.purchaseAfterCompletion) return false;
      return state.nextFollowupOn <= today;
    })
    .map((mission) => ({ ...mission, completedBefore: Boolean(missionStates[mission.id]) }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
