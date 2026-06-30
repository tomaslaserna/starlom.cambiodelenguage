export const ORDER_RECEIPT_OPTIONS = [
  { value: "remito", label: "Remito", receiptType: 0 },
  { value: "factura_a", label: "Factura A", receiptType: 1 },
  { value: "factura_b", label: "Factura B", receiptType: 6 },
  { value: "factura_c", label: "Factura C", receiptType: 11 },
  { value: "nota_debito_a", label: "Nota de debito A", receiptType: 2 },
  { value: "nota_debito_b", label: "Nota de debito B", receiptType: 7 },
  { value: "nota_debito_c", label: "Nota de debito C", receiptType: 12 },
  { value: "nota_credito_a", label: "Nota de credito A", receiptType: 3 },
  { value: "nota_credito_b", label: "Nota de credito B", receiptType: 8 },
  { value: "nota_credito_c", label: "Nota de credito C", receiptType: 13 },
] as const;

export type OrderReceiptValue = (typeof ORDER_RECEIPT_OPTIONS)[number]["value"];

const ORDER_RECEIPT_VALUES = new Set<string>(ORDER_RECEIPT_OPTIONS.map((option) => option.value));

const ORDER_RECEIPT_ALIASES: Record<string, OrderReceiptValue> = {
  a: "factura_a",
  b: "factura_b",
  c: "factura_c",
  factura: "factura_b",
  facturaa: "factura_a",
  facturab: "factura_b",
  facturac: "factura_c",
  factura_a: "factura_a",
  factura_b: "factura_b",
  factura_c: "factura_c",
  nc: "nota_credito_b",
  nca: "nota_credito_a",
  ncb: "nota_credito_b",
  ncc: "nota_credito_c",
  nd: "nota_debito_b",
  nda: "nota_debito_a",
  ndb: "nota_debito_b",
  ndc: "nota_debito_c",
  notacredito: "nota_credito_b",
  notacreditoa: "nota_credito_a",
  notacreditob: "nota_credito_b",
  notacreditoc: "nota_credito_c",
  nota_credito: "nota_credito_b",
  nota_credito_a: "nota_credito_a",
  nota_credito_b: "nota_credito_b",
  nota_credito_c: "nota_credito_c",
  notadebito: "nota_debito_b",
  notadebitoa: "nota_debito_a",
  notadebitob: "nota_debito_b",
  notadebitoc: "nota_debito_c",
  nota_debito: "nota_debito_b",
  nota_debito_a: "nota_debito_a",
  nota_debito_b: "nota_debito_b",
  nota_debito_c: "nota_debito_c",
  remito: "remito",
};

function normalizeReceiptKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeDesiredDocument(value: string): OrderReceiptValue {
  const normalized = normalizeReceiptKey(value);
  if (!normalized) return "remito";
  if (ORDER_RECEIPT_VALUES.has(normalized)) return normalized as OrderReceiptValue;

  const compact = normalized.replaceAll("_", "");
  return ORDER_RECEIPT_ALIASES[normalized] ?? ORDER_RECEIPT_ALIASES[compact] ?? "remito";
}

export function desiredDocumentLabel(value: string) {
  const normalized = normalizeDesiredDocument(value);
  return ORDER_RECEIPT_OPTIONS.find((option) => option.value === normalized)?.label ?? "Remito";
}

const ORDER_CREATION_VALUES = new Set<OrderReceiptValue>(
  ORDER_RECEIPT_OPTIONS.map((option) => option.value),
);

export const ORDER_CREATION_RECEIPT_OPTIONS = ORDER_RECEIPT_OPTIONS.filter((option) =>
  ORDER_CREATION_VALUES.has(option.value),
);

export const ORDER_CONFIRMATION_RECEIPT_OPTIONS = ORDER_RECEIPT_OPTIONS.filter(
  (option) => option.value === "remito" || option.value.startsWith("factura_"),
);

export function invoiceDocumentForFiscalCondition(
  fiscalCondition = "",
  preferredReceiptType = "",
): OrderReceiptValue {
  const preferred = normalizeDesiredDocument(preferredReceiptType);
  if (preferred.startsWith("factura_")) return preferred;

  const fiscalKey = normalizeReceiptKey(fiscalCondition).replaceAll("_", "");
  if (!fiscalKey) return "remito";
  if (fiscalKey.includes("responsableinscripto")) return "factura_a";
  if (fiscalKey.includes("monotributo")) return "factura_c";
  if (fiscalKey.includes("consumidorfinal") || fiscalKey.includes("exento")) return "factura_b";
  return "factura_b";
}

export function normalizeOrderCreationDocument(receiptType: string, fiscalCondition = ""): OrderReceiptValue {
  if (receiptType.trim()) {
    const explicit = normalizeDesiredDocument(receiptType);
    if (ORDER_CREATION_VALUES.has(explicit)) return explicit;
  }

  return invoiceDocumentForFiscalCondition(fiscalCondition);
}

export function receiptTypeCode(value: string) {
  const normalized = normalizeDesiredDocument(value);
  return ORDER_RECEIPT_OPTIONS.find((option) => option.value === normalized)?.receiptType ?? 0;
}

export function receiptAddsVat(value: string) {
  const normalized = normalizeDesiredDocument(value);
  return normalized.endsWith("_a") || normalized.endsWith("_b");
}
