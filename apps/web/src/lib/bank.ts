// Pure "Banco" helpers: quota math and file validation. No DB or "@/" imports,
// so this runs under `node --test`. Server orchestration lives in
// lib/bank-store.ts.

export type BankScope = "personal" | "shared";

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const PERSONAL_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MB por usuario
export const SHARED_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB para la empresa

// Extension -> canonical mime. Drives both validation and the bucket contract.
export const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXTENSION));

export function quotaForScope(scope: BankScope): number {
  return scope === "shared" ? SHARED_QUOTA_BYTES : PERSONAL_QUOTA_BYTES;
}

export function remainingQuota(usedBytes: number, scope: BankScope): number {
  return Math.max(0, quotaForScope(scope) - usedBytes);
}

export function wouldExceedQuota(usedBytes: number, addBytes: number, scope: BankScope): boolean {
  return usedBytes + addBytes > quotaForScope(scope);
}

export function extensionFromName(name: string): string {
  return name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

export type BankFileMetadata = {
  extension: string;
  contentType: string;
  size: number;
};

export function validateBankFile(input: { name: string; mime: string; size: number }):
  | { data: BankFileMetadata; error?: undefined }
  | { data?: undefined; error: string } {
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) {
    return { error: "El archivo esta vacio" };
  }
  if (size > MAX_FILE_BYTES) {
    return { error: `El archivo supera el limite de ${formatBytes(MAX_FILE_BYTES)}` };
  }

  const extension = extensionFromName(input.name);
  const expectedMime = MIME_BY_EXTENSION[extension];
  if (!expectedMime) {
    return { error: "Tipo de archivo no permitido (PDF, imagenes, Office, CSV o TXT)" };
  }
  const mime = (input.mime || "").trim();
  if (mime && mime !== expectedMime && !ALLOWED_MIME.has(mime)) {
    return { error: "El tipo de archivo no coincide con la extension" };
  }

  return { data: { extension, contentType: expectedMime, size } };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const rounded = value >= 100 || exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
}
