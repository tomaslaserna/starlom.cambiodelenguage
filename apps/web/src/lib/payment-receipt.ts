export const PAYMENT_RECEIPT_MAX_BYTES = 3 * 1024 * 1024;
export const PAYMENT_RECEIPT_ACCEPT = "image/png,image/jpeg,image/webp";

export type PaymentReceiptReading = {
  amount: number | null;
  date: string | null;
  operation: string | null;
};

export function paymentReceiptFileError(file: Pick<File, "size" | "type">): string | null {
  if (!file.size || file.size > PAYMENT_RECEIPT_MAX_BYTES) return "El comprobante debe pesar hasta 3 MB.";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "Adjuntá una imagen JPG, PNG o WEBP.";
  return null;
}

export async function paymentReceiptBytes(file: File): Promise<Uint8Array> {
  const error = paymentReceiptFileError(file);
  if (error) throw new Error(error);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  const webp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (!(file.type === "image/png" && png || file.type === "image/jpeg" && jpeg || file.type === "image/webp" && webp)) {
    throw new Error("El archivo no contiene una imagen válida del formato indicado.");
  }
  return bytes;
}

// Treat even schema-valid AI output as suggestions, never as accounting instructions.
export function normalizePaymentReceiptReading(value: PaymentReceiptReading): PaymentReceiptReading {
  const date = typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
    && Number.isFinite(Date.parse(value.date)) && new Date(value.date).toISOString().slice(0, 10) === value.date ? value.date : null;
  const amount = typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0.005 && value.amount <= 1_000_000_000
    ? Math.round(value.amount * 100) / 100 : null;
  const operation = typeof value.operation === "string" && /^[\p{L}\p{N} ._/-]{1,100}$/u.test(value.operation.trim()) ? value.operation.trim() : null;
  return { amount, date, operation };
}
