type SaleCommercialCodeInput = {
  commercialNumber?: number | string | null;
  saleNumber?: string | null;
  deliveryNumber?: number | string | null;
  legacyRemittanceNumber?: number | string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function positiveInteger(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function sequenceFromSaleNumber(value: string | null | undefined) {
  const saleNumber = String(value ?? "").trim();
  if (!saleNumber || UUID_PATTERN.test(saleNumber)) return null;

  const match = /^P-(\d+)$/i.exec(saleNumber);
  return match ? positiveInteger(match[1]) : null;
}

function legacyRemittanceFromSaleNumber(value: string | null | undefined) {
  const saleNumber = String(value ?? "").trim();
  const match = /^REM-(?:\d{4}-)?(\d+)$/i.exec(saleNumber);
  return match ? positiveInteger(match[1]) : null;
}

/**
 * Returns a business-facing sale code and never exposes the database UUID.
 * Current sale sequences use four digits; remittance fallbacks keep the
 * eight-digit document format used by remittance PDFs.
 */
export function formatSaleCommercialCode({
  commercialNumber,
  saleNumber,
  deliveryNumber,
  legacyRemittanceNumber,
}: SaleCommercialCodeInput) {
  const dedicatedCommercialNumber = positiveInteger(commercialNumber);
  if (dedicatedCommercialNumber !== null) {
    return String(dedicatedCommercialNumber).padStart(4, "0");
  }

  const saleSequence = sequenceFromSaleNumber(saleNumber);
  if (saleSequence !== null) return String(saleSequence).padStart(4, "0");

  const remittanceNumber =
    positiveInteger(deliveryNumber) ??
    legacyRemittanceFromSaleNumber(saleNumber) ??
    positiveInteger(legacyRemittanceNumber);
  if (remittanceNumber !== null) return String(remittanceNumber).padStart(8, "0");

  return "Sin número";
}
