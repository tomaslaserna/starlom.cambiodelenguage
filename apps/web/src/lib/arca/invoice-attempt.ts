import { ApiError } from "@/lib/api-response";
import { getArcaConfig } from "@/lib/arca/config";
import { authorizeArcaInvoice, consultArcaAuthorizedReceipt } from "@/lib/arca/wsfe";
import { getDbPool } from "@/lib/db";

export async function withInvoiceLock<T>(issue: () => Promise<T>) {
  const config = getArcaConfig();
  const client = await getDbPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [[config.mode, config.cuit, config.pointOfSale, "invoice"].join(":")]);
    const result = await issue();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as {code?: string}).code === "55P03") throw new ApiError(409, "Otra factura está en curso. Volvé a consultar la venta.");
    throw error;
  } finally {
    client.release();
  }
}

export async function authorizeReservedInvoice(company: number, sale: string, requiresReview: boolean,
  input: Parameters<typeof authorizeArcaInvoice>[0]) {
  const {mode, cuit, pointOfSale} = getArcaConfig();
  const db = getDbPool();
  const key = [mode, cuit, company, sale];
  const where = "mode=$1 AND issuer=$2 AND company_id=$3 AND sale_id=$4";
  const saved = (await db.query("SELECT * FROM starlim_arca.invoice_attempts WHERE " + where, key)).rows[0];
  const document = input.customerDocument.replace(/\D/g, "");
  const cents = Math.round(input.totalAmount * 100);
  if (saved) {
    if (saved.point !== pointOfSale || saved.kind !== input.receiptType || saved.document !== document ||
        Number(saved.cents) !== cents || Number(saved.vat) !== input.vatRate || saved.vat_condition !== input.customerVatCondition)
      throw new ApiError(409, "La venta cambió desde el intento fiscal. Requiere conciliación.");
    const receipt = await consultArcaAuthorizedReceipt(saved.kind, saved.number);
    if (receipt && receipt.receiptNumber === saved.number && receipt.pointOfSale === saved.point &&
        receipt.receiptType === saved.kind && receipt.customerDocument === document &&
        Math.round(receipt.totalAmount * 100) === cents && receipt.issueDate.replaceAll("-", "") === saved.issued_on)
      return receipt;
    throw new ApiError(409, "El número reservado sigue pendiente de conciliación en ARCA.");
  }
  let reserved = false;
  try {
    return await authorizeArcaInvoice(input, {
    async reserve(number, date) {
      if (requiresReview) {
        const window = (await db.query("SELECT first_number FROM starlim_arca.reconciliation_windows WHERE mode=$1 AND issuer=$2 AND sale_id=$3 AND point=$4 AND kind=$5",
          [mode,cuit,sale,pointOfSale,input.receiptType])).rows[0];
        if (!window || window.first_number >= number) throw new ApiError(409, "El intento anterior requiere conciliación fiscal.");
        for (let n = window.first_number; n < number; n++) {
          const receipt = await consultArcaAuthorizedReceipt(input.receiptType, n);
          if (!receipt || receipt.receiptNumber !== n || receipt.pointOfSale !== pointOfSale || receipt.receiptType !== input.receiptType ||
              (receipt.customerDocument === document && Math.round(receipt.totalAmount * 100) === cents))
            throw new ApiError(409, "Revisá el comprobante " + n + " antes de emitir esta venta.");
        }
      }
      await db.query("INSERT INTO starlim_arca.invoice_attempts(mode,issuer,company_id,sale_id,point,kind,number,issued_on,document,cents,vat,vat_condition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [...key,pointOfSale,input.receiptType,number,date,document,cents,input.vatRate,input.customerVatCondition]);
      reserved = true;
    },
    async rejected(number) {
      await db.query("DELETE FROM starlim_arca.invoice_attempts WHERE " + where + " AND number=$5", [...key, number]);
      reserved = false;
    },
    });
  } catch (error) {
    if (!reserved && !requiresReview) {
      throw new ApiError(error instanceof ApiError ? error.status : 502,
        "Sin autorización pendiente. " + (error instanceof Error ? error.message : "Error fiscal"));
    }
    throw error;
  }
}
