import type { SupervisorOperationalSnapshot } from "@/lib/supervisor-lab/read-model";

export type SupervisorTaskCandidate = {
  kind: "order_approval" | "delivery_confirmation" | "fiscal_decision";
  entityType: "sale";
  entityId: string;
  title: string;
  detail: string;
  priority: "normal" | "high";
  dedupeKey: string;
  dueAt: string | null;
  evidence: Record<string, unknown>;
};

export function buildSupervisorTaskCandidates(
  snapshot: SupervisorOperationalSnapshot,
  now = new Date(),
): SupervisorTaskCandidate[] {
  const today = now.toISOString().slice(0, 10);
  const candidates: SupervisorTaskCandidate[] = [];
  for (const order of snapshot.orders) {
    if (order.status === "pending_approval") {
      candidates.push({
        kind: "order_approval",
        entityType: "sale",
        entityId: order.id,
        title: "Pedido sin autorizar",
        detail: `El pedido ${order.number} sigue pendiente de autorización.`,
        priority: "normal",
        dedupeKey: `order_approval:${order.id}`,
        dueAt: today,
        evidence: { number: order.number, sourceHref: "/orders" },
      });
    } else if (order.deliveryDate && order.deliveryDate <= today) {
      candidates.push({
        kind: "delivery_confirmation",
        entityType: "sale",
        entityId: order.id,
        title: "Confirmar entrega",
        detail: `¿El pedido ${order.number} ya fue entregado?`,
        priority: "high",
        dedupeKey: `delivery_confirmation:${order.id}`,
        dueAt: order.deliveryDate,
        evidence: { number: order.number, sourceHref: "/orders" },
      });
    }
  }
  for (const sale of snapshot.sales) {
    if (sale.fiscalDecision !== "pending") continue;
    candidates.push({
      kind: "fiscal_decision",
      entityType: "sale",
      entityId: sale.id,
      title: "Definir facturación",
      detail: `La venta ${sale.number} fue entregada y todavía no tiene decisión fiscal.`,
      priority: "high",
      dedupeKey: `fiscal_decision:${sale.id}`,
      dueAt: sale.saleDate,
      evidence: { number: sale.number, sourceHref: "/fiscal" },
    });
  }
  return candidates;
}
