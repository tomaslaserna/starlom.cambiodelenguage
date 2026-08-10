import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { withCompanyContext } from "@/lib/db";
import {
  PRODUCT_IMAGES_BUCKET,
  createSignedStorageUpload,
  publicProductImageUrl,
  removeStorageObjects,
  storageObjectInfo,
} from "@/lib/storage";
import { validateProductImage } from "@/lib/product-image";

function companyPrefix(companyId: number) {
  return `empresa_${companyId}/`;
}

export async function prepareProductImageUpload(
  session: AuthSession,
  input: { fileName?: unknown; mime?: unknown; size?: unknown },
) {
  const validation = validateProductImage({
    name: String(input.fileName ?? ""),
    mime: String(input.mime ?? ""),
    size: Number(input.size ?? 0),
  });
  if (!validation.data) throw new ApiError(400, validation.error);

  const objectPath = `${companyPrefix(session.companyId)}${randomUUID()}.${validation.data.extension}`;
  const signed = await createSignedStorageUpload(objectPath, PRODUCT_IMAGES_BUCKET);
  return { bucket: signed.bucket, path: signed.path, token: signed.token, contentType: validation.data.contentType };
}

// Path must live under this company's prefix in the product-images bucket, so a
// client can't point a product at an arbitrary object.
function assertOwnObjectPath(session: AuthSession, objectPath: string) {
  if (!objectPath || objectPath.includes("..") || !objectPath.startsWith(companyPrefix(session.companyId))) {
    throw new ApiError(400, "Ruta de imagen inválida");
  }
}

export async function setProductImage(session: AuthSession, productIdInput: unknown, objectPathInput: unknown) {
  const productId = String(productIdInput ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new ApiError(400, "Producto inválido");
  const objectPath = String(objectPathInput ?? "");
  assertOwnObjectPath(session, objectPath);

  // Confirms the upload actually landed before pointing the product at it.
  const info = await storageObjectInfo(PRODUCT_IMAGES_BUCKET, objectPath);
  if (!info.size) throw new ApiError(400, "La imagen no terminó de subirse");

  const previous = await withCompanyContext(session.companyId, async (client) => {
    const current = await client.query<{ image_path: string | null }>(
      "SELECT image_path FROM products WHERE id = $1::uuid AND empresa_id = $2 FOR UPDATE",
      [productId, session.companyId],
    );
    if (!current.rows[0]) throw new ApiError(404, "Producto no encontrado");
    await client.query("UPDATE products SET image_path = $1 WHERE id = $2::uuid AND empresa_id = $3", [
      objectPath,
      productId,
      session.companyId,
    ]);
    return current.rows[0].image_path;
  });

  if (previous && previous !== objectPath) {
    await removeStorageObjects(PRODUCT_IMAGES_BUCKET, [previous]).catch(() => undefined);
  }
  return { imageUrl: publicProductImageUrl(objectPath) };
}

export async function removeProductImage(session: AuthSession, productIdInput: unknown) {
  const productId = String(productIdInput ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new ApiError(400, "Producto inválido");

  const previous = await withCompanyContext(session.companyId, async (client) => {
    const current = await client.query<{ image_path: string | null }>(
      "SELECT image_path FROM products WHERE id = $1::uuid AND empresa_id = $2 FOR UPDATE",
      [productId, session.companyId],
    );
    if (!current.rows[0]) throw new ApiError(404, "Producto no encontrado");
    await client.query("UPDATE products SET image_path = NULL WHERE id = $1::uuid AND empresa_id = $2", [
      productId,
      session.companyId,
    ]);
    return current.rows[0].image_path;
  });

  if (previous) {
    await removeStorageObjects(PRODUCT_IMAGES_BUCKET, [previous]).catch(() => undefined);
  }
}
