export const CUSTOMER_RECEIPT_OPTIONS = ["Remito", "Factura A", "Factura B"] as const;

export type CustomerReceiptType = (typeof CUSTOMER_RECEIPT_OPTIONS)[number];
