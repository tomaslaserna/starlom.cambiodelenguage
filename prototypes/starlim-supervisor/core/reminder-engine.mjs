function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function reminderKey(kind, entityId, dueDate) {
  return `${kind}:${entityId}:${dateKey(dueDate)}`;
}

export function detectReminders(snapshot, now = new Date()) {
  const today = dateKey(now);
  const candidates = [];

  for (const order of snapshot.orders ?? []) {
    if (order.status === "pending_approval") {
      candidates.push(reminder("order_approval", order.id, today, "Pedido sin autorizar", `El pedido ${order.number} sigue pendiente de autorización.`, "medium"));
    }
    if (order.status === "authorized" && order.deliveryDate && order.deliveryDate <= today) {
      candidates.push(reminder("delivery_confirmation", order.id, order.deliveryDate, "Confirmar entrega", `¿El pedido ${order.number} ya fue entregado?`, "high"));
    }
  }

  for (const sale of snapshot.sales ?? []) {
    if (sale.status === "delivered" && sale.fiscalDecision === "pending") {
      candidates.push(reminder("fiscal_decision", sale.id, sale.saleDate || today, "Definir facturación", `La venta ${sale.number} fue entregada y todavía no tiene decisión fiscal.`, "high"));
    }
  }

  const seen = new Set(snapshot.existingReminderKeys ?? []);
  return candidates.filter((candidate) => {
    if (seen.has(candidate.dedupeKey)) return false;
    seen.add(candidate.dedupeKey);
    return true;
  });
}

function reminder(kind, entityId, dueDate, title, message, priority) {
  return { kind, entityId, dueDate, title, message, priority, dedupeKey: reminderKey(kind, entityId, dueDate) };
}
