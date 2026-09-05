import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-response";
import { envValue } from "@/lib/env";

const DEFAULT_BUCKET = "uploads";
// Dedicated private bucket for the "Banco" file storage feature. Kept separate
// from the message-uploads bucket so it has its own size/mime limits.
export const BANK_BUCKET = "bank";
// Public bucket for product images (catalog thumbnails).
export const PRODUCT_IMAGES_BUCKET = "product-images";

function assertAllowedBucket(bucket: string) {
  const config = storageConfig();
  if (bucket !== config.bucket && bucket !== BANK_BUCKET && bucket !== PRODUCT_IMAGES_BUCKET) {
    throw new ApiError(403, "Bucket no permitido");
  }
}

// Public read URL for an object in the product-images bucket.
export function publicProductImageUrl(path: string): string {
  const config = storageConfig();
  return `${config.url}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encodedObjectPath(path)}`;
}
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

type StorageConfig = {
  url: string;
  key: string;
  bucket: string;
};

type ImageUploadInput = {
  file: File;
  folder: "recibos";
  namePrefix: string;
  maxBytes?: number;
};

let storageAdminClient: SupabaseClient | null = null;

function storageConfig(): StorageConfig {
  const url = (envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL") || "").replace(
    /\/+$/,
    "",
  );
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bucket = envValue("STARLIM_STORAGE_BUCKET") || DEFAULT_BUCKET;

  if (!url || !key) {
    throw new ApiError(
      503,
      "Storage no configurado. Defini SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en variables privadas.",
    );
  }

  return { url, key, bucket };
}

function getStorageAdminClient() {
  if (!storageAdminClient) {
    const config = storageConfig();
    storageAdminClient = createClient(config.url, config.key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
  return storageAdminClient;
}

function storageErrorStatus(error: { statusCode?: string | number } | null) {
  const status = Number(error?.statusCode ?? 0);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
}

function extensionFromName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return extension;
}

export function sanitizeStorageName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function encodedObjectPath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function storageObjectReference(bucket: string, path: string) {
  return `starlim-storage://${bucket}/${path}`;
}

export function parseStorageObjectReference(value: string) {
  const match = value.match(/^starlim-storage:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    bucket: match[1],
    path: match[2],
  };
}

export function storageDownloadUrl(value: string) {
  const reference = parseStorageObjectReference(value);
  if (!reference) return value;
  return `/api/storage/${encodeURIComponent(reference.bucket)}/${encodedObjectPath(reference.path)}`;
}

export function assertCompanyStoragePath(path: string, companyId: number) {
  const prefix = `recibos/recibo_${companyId}_`;
  if (!path.startsWith(prefix)) {
    throw new ApiError(403, "Archivo fuera del ambito de la empresa");
  }
}

function assertImageSignature(buffer: Buffer, mime: string) {
  if (mime === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return;
  if (mime === "image/png" && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return;
  if (mime === "image/gif" && buffer.subarray(0, 4).toString("ascii") === "GIF8") return;
  if (mime === "image/webp" && buffer.subarray(0, 4).toString("ascii") === "RIFF") return;
  throw new ApiError(400, "El archivo no es una imagen valida");
}

export function imageFileFromFormData(formData: FormData, names = ["file", "foto", "image"]) {
  for (const name of names) {
    const value = formData.get(name);
    if (value instanceof File && value.size > 0) return value;
  }
  return null;
}

export function stringFieldsFromFormData(formData: FormData): Record<string, string> {
  const body: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") body[key] = value;
  }
  return body;
}

export async function uploadImageFile({
  file,
  folder,
  namePrefix,
  maxBytes = 8 * 1024 * 1024,
}: ImageUploadInput) {
  if (file.size > maxBytes) throw new ApiError(400, "El archivo supera el limite de 8 MB");

  const extension = extensionFromName(file.name);
  const expectedMime = IMAGE_MIME_BY_EXTENSION[extension];
  if (!expectedMime) throw new ApiError(400, "Extension no permitida. Usa JPG, PNG, WEBP o GIF");
  if (file.type && file.type !== expectedMime) {
    throw new ApiError(400, "El tipo de archivo no coincide con la extension");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  assertImageSignature(buffer, expectedMime);

  const config = storageConfig();
  const baseName = sanitizeStorageName(file.name.replace(/\.[^.]+$/, "")) || "imagen";
  const objectPath = `${folder}/${sanitizeStorageName(namePrefix)}_${Date.now()}_${randomUUID()}_${baseName}.${extension}`;
  const endpoint = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodedObjectPath(objectPath)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      apikey: config.key,
      "Content-Type": expectedMime,
      "x-upsert": "false",
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(
      response.status,
      `Storage respondio ${response.status}: ${detail.slice(0, 180) || response.statusText}`,
    );
  }

  return {
    bucket: config.bucket,
    path: objectPath,
    url: storageObjectReference(config.bucket, objectPath),
  };
}

export async function createSignedStorageUpload(path: string, bucket?: string) {
  const config = storageConfig();
  const targetBucket = bucket ?? config.bucket;
  assertAllowedBucket(targetBucket);
  const { data, error } = await getStorageAdminClient()
    .storage
    .from(targetBucket)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data?.token) {
    throw new ApiError(storageErrorStatus(error), error?.message || "No se pudo autorizar la carga");
  }

  return {
    bucket: targetBucket,
    path: data.path || path,
    token: data.token,
  };
}

export async function storageObjectInfo(bucket: string, path: string) {
  assertAllowedBucket(bucket);

  const { data, error } = await getStorageAdminClient().storage.from(bucket).info(path);
  if (error || !data) {
    throw new ApiError(storageErrorStatus(error), error?.message || "El archivo no termino de cargarse");
  }

  return {
    contentType: data.contentType || "",
    size: Number(data.size || 0),
  };
}

export async function removeStorageObjects(bucket: string, paths: string[]) {
  if (!paths.length) return;
  assertAllowedBucket(bucket);

  const { error } = await getStorageAdminClient().storage.from(bucket).remove(paths);
  if (error) throw new ApiError(storageErrorStatus(error), error.message || "No se pudo limpiar la carga");
}

export async function uploadStorageImageBuffer(input: {
  bucket: string;
  path: string;
  buffer: Buffer;
  contentType: string;
}) {
  assertAllowedBucket(input.bucket);
  const expectedMime = Object.values(IMAGE_MIME_BY_EXTENSION).includes(input.contentType)
    ? input.contentType
    : "";
  if (!expectedMime) throw new ApiError(400, "Formato de imagen no permitido");
  if (input.buffer.length < 1024 || input.buffer.length > 8 * 1024 * 1024) {
    throw new ApiError(400, "La imagen no tiene un tamaño válido");
  }
  assertImageSignature(input.buffer, expectedMime);

  const { error } = await getStorageAdminClient()
    .storage
    .from(input.bucket)
    .upload(input.path, input.buffer, { contentType: expectedMime, upsert: false });
  if (error) throw new ApiError(storageErrorStatus(error), error.message || "No se pudo subir la imagen");
}

export async function createSignedStorageUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 300,
  downloadName?: string,
) {
  assertAllowedBucket(bucket);

  const { data, error } = await getStorageAdminClient()
    .storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) {
    throw new ApiError(storageErrorStatus(error), error?.message || "No se pudo firmar el archivo");
  }

  return data.signedUrl;
}
