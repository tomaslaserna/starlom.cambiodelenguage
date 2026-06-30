const SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const ORDER_STATUSES = ["cargado", "confirmado", "entregado", "cancelado"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "cargado", label: "Cargado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
];

const ORDER_STATUS_SET = new Set<string>(ORDER_STATUSES);

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUS_SET.has(value);
}

export function normalizeOrderStatusValue(value: string | null | undefined): OrderStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (isOrderStatus(status)) return status;
  if (status === "recibido" || status === "registrada" || status === "registrado") return "cargado";
  if (status === "en_proceso" || status === "pendiente_entrega") return "confirmado";
  if (status === "cancelada" || status === "anulado" || status === "anulada") return "cancelado";
  return "cargado";
}

export function orderStatusLabel(value: string) {
  const status = normalizeOrderStatusValue(value);
  return ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Cargado";
}

function assertSqlIdentifier(identifier: string) {
  if (!SQL_IDENTIFIER.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
}

export function normalizedOrderStatusSql(alias: string) {
  assertSqlIdentifier(alias);
  const expression = `COALESCE(${alias}.order_status, ${alias}.status, 'cargado')`;

  return `CASE
    WHEN ${expression} IN ('cargado','confirmado','entregado','cancelado') THEN ${expression}
    WHEN ${expression} IN ('recibido','registrada','registrado') THEN 'cargado'
    WHEN ${expression} IN ('en_proceso','pendiente_entrega') THEN 'confirmado'
    WHEN ${expression} IN ('cancelada','anulado','anulada') THEN 'cancelado'
    ELSE 'cargado'
  END`;
}
