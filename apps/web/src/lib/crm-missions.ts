import type { CrmClientsResult } from "@/lib/crm";
import type { OpenCustomerAccount } from "@/lib/customer-accounts";
import type { LeadFollowupAgendaItem } from "@/lib/leads";
import type { VendorQuote, QuoteBucket } from "@/lib/crm-quotes";

export type CrmMissionKind = "lead" | "cliente" | "presupuesto" | "cobro";
export type CrmMissionUrgency = "ahora" | "hoy" | "proximo";

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
  phone?: string;
};

type MissionInput = {
  clients: CrmClientsResult;
  leads: LeadFollowupAgendaItem[];
  quotes: Record<QuoteBucket, VendorQuote[]>;
  accounts: OpenCustomerAccount[];
};

function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.startsWith("54") ? digits : `54${digits}`;
}
export function buildCrmMissions({ clients, leads, quotes, accounts }: MissionInput): CrmMission[] {
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
      phone: whatsappPhone(lead.phone),
    });
  }

  for (const quote of quotes.vencidos) {
    missions.push({
      id: `quote-overdue-${quote.id}`,
      kind: "presupuesto",
      urgency: "ahora",
      score: 96 + Math.min(3, Math.abs(quote.daysRemaining ?? 0)),
      title: `Reactivar ${quote.quoteNumber}`,
      reason: `Venció hace ${Math.abs(quote.daysRemaining ?? 0)} ${Math.abs(quote.daysRemaining ?? 0) === 1 ? "día" : "días"}`,
      detail: `${quote.clientName || "Cliente sin identificar"} · ${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(quote.total)}`,
      href: `/crm/presupuestos?q=${encodeURIComponent(quote.quoteNumber)}`,
      actionLabel: "Revisar presupuesto",
    });
  }

  for (const quote of quotes.por_vencer) {
    missions.push({
      id: `quote-due-${quote.id}`,
      kind: "presupuesto",
      urgency: "hoy",
      score: 90 - Math.max(0, quote.daysRemaining ?? 0),
      title: `Definir ${quote.quoteNumber}`,
      reason: quote.daysRemaining === 0 ? "El presupuesto vence hoy" : `Vence en ${quote.daysRemaining} días`,
      detail: quote.clientName || "Cliente sin identificar",
      href: `/crm/presupuestos?q=${encodeURIComponent(quote.quoteNumber)}`,
      actionLabel: "Ver oportunidad",
    });
  }

  const clientBuckets = [
    { key: "perdido", score: 86, urgency: "ahora" as const, reason: "Se alejó más del doble de su ritmo habitual" },
    { key: "riesgo", score: 78, urgency: "hoy" as const, reason: "Está fuera de su ritmo habitual de compra" },
    { key: "contactar", score: 68, urgency: "hoy" as const, reason: "Llegó su fecha estimada de recompra" },
  ];
  for (const bucket of clientBuckets) {
    for (const client of (clients.groups[bucket.key] ?? []).slice(0, 5)) {
      missions.push({
        id: `client-${bucket.key}-${client.customerId}`,
        kind: "cliente",
        urgency: bucket.urgency,
        score: bucket.score + Math.min(5, Math.max(0, client.daysSinceLastPurchase ?? 0) / 30),
        title: `${bucket.key === "perdido" ? "Recuperar" : "Recontactar"} a ${client.customerName}`,
        reason: bucket.reason,
        detail: client.daysSinceLastPurchase == null ? client.zona : `${client.daysSinceLastPurchase} días desde la última compra · ${client.zona}`,
        href: `/crm/clientes/${client.customerId}`,
        actionLabel: "Abrir ficha 360°",
        phone: whatsappPhone(client.phone),
      });
    }
  }

  for (const account of accounts.filter((item) => item.balance > 0.005).slice(0, 4)) {
    missions.push({
      id: `account-${account.clientId}`,
      kind: "cobro",
      urgency: "proximo",
      score: 50 + Math.min(15, account.balance / 100_000),
      title: `Revisar saldo de ${account.name}`,
      reason: "Tiene cuenta corriente abierta",
      detail: new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(account.balance),
      href: `/crm/cobros?q=${encodeURIComponent(account.name)}`,
      actionLabel: "Gestionar cobro",
    });
  }

  return missions.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 16);
}
