import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-response";
import { envValue } from "@/lib/env";

const DEFAULT_BUCKET = "uploads";
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

function extensionFromName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return extension;
}

function sanitizeName(value: string) {
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

export function stringFieldsFromFormData(formData: FormData) {
  const body: Record<string, unknown> = {};
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
  const baseName = sanitizeName(file.name.replace(/\.[^.]+$/, "")) || "imagen";
  const objectPath = `${folder}/${sanitizeName(namePrefix)}_${Date.now()}_${randomUUID()}_${baseName}.${extension}`;
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
    url: `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodedObjectPath(objectPath)}`,
  };
}
