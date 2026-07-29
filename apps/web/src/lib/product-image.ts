// Pure validation for product images. No DB or "@/" imports (unit-testable).

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export type ProductImageMetadata = { extension: string; contentType: string; size: number };

export function validateProductImage(input: { name: string; mime: string; size: number }):
  | { data: ProductImageMetadata; error?: undefined }
  | { data?: undefined; error: string } {
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) return { error: "El archivo está vacío" };
  if (size > MAX_IMAGE_BYTES) return { error: "La imagen supera el límite de 5 MB" };

  const extension = input.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const expectedMime = IMAGE_MIME_BY_EXT[extension];
  if (!expectedMime) return { error: "Formato no permitido. Usá JPG, PNG, WEBP o GIF" };

  const mime = (input.mime || "").trim().toLowerCase();
  if (mime && mime !== expectedMime) return { error: "El tipo de archivo no coincide con la extensión" };

  return { data: { extension, contentType: expectedMime, size } };
}
