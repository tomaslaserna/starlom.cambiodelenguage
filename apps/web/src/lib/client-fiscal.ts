export type ClientFiscalData = {
  taxId?: string | null;
  fiscalCondition?: string | null;
};

// Un cliente puede recibir factura fiscal solo si tiene CUIT/DNI (>= 8 dígitos) y
// una condición fiscal declarada. Sin ambos, el paso final ofrece solo remito con precios.
export function hasCompleteFiscalData(client: ClientFiscalData): boolean {
  const taxIdDigits = (client.taxId ?? "").replace(/[^0-9]/g, "");
  const fiscalCondition = (client.fiscalCondition ?? "").trim();
  return taxIdDigits.length >= 8 && fiscalCondition.length > 0;
}
