import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext } from "@/lib/db";
import {
  MESSAGE_ATTACHMENT_MAX_FILES,
  validateMessageAttachment,
  type MessageAttachmentMetadata,
} from "@/lib/message-attachment-rules";
import {
  createSignedStorageUpload,
  removeStorageObjects,
  sanitizeStorageName,
  storageObjectInfo,
} from "@/lib/storage";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PENDING_UPLOADS = 20;

type MessageDbClient = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rowCount: number | null; rows: T[] }>;
};

type PreparedUploadRow = {
  id: string;
  bucket: string;
  objeto_path: string;
  nombre_original: string;
  tipo_mime: string;
  tamano_bytes: string | number;
};

export type MessageAttachment = {
  id: number;
  messageId: number;
  fileName: string;
  contentType: string;
  size: number;
  downloadUrl: string;
};

function attachmentDownloadUrl(messageId: number, attachmentId: number) {
  return `/api/messages/${messageId}/attachments/${attachmentId}`;
}

function parseMetadata(input: Record<string, unknown>): MessageAttachmentMetadata {
  return {
    fileName: String(input.fileName ?? input.nombre ?? ""),
    contentType: String(input.contentType ?? input.tipoMime ?? ""),
    size: Number(input.size ?? input.tamano ?? 0),
  };
}

export function messageAttachmentIdsFromValue(value: unknown) {
  if (value === undefined || value === null || value === "") return [];

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ApiError(400, "La lista de adjuntos no es valida");
    }
  }

  if (!Array.isArray(parsed)) throw new ApiError(400, "La lista de adjuntos no es valida");
  const ids = [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))];
  if (ids.length > MESSAGE_ATTACHMENT_MAX_FILES) {
    throw new ApiError(400, `Se permiten hasta ${MESSAGE_ATTACHMENT_MAX_FILES} adjuntos por mensaje`);
  }
  if (ids.some((id) => !UUID_PATTERN.test(id))) throw new ApiError(400, "Hay un adjunto invalido");
  return ids;
}

async function cleanupExpiredUploads(session: AuthSession) {
  const expired = await queryWithCompanyContext<{ id: string; bucket: string; objeto_path: string }>(
    session.companyId,
    `
      SELECT id::text, bucket, objeto_path
      FROM mensaje_cargas
      WHERE empresa_id = $1
        AND consumido_at IS NULL
        AND expira_at <= NOW()
      ORDER BY expira_at ASC
      LIMIT 20
    `,
    [session.companyId],
  );
  if (!expired.rows.length) return;

  const byBucket = new Map<string, string[]>();
  for (const row of expired.rows) {
    byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.objeto_path]);
  }

  try {
    for (const [bucket, paths] of byBucket) await removeStorageObjects(bucket, paths);
    await queryWithCompanyContext(
      session.companyId,
      `DELETE FROM mensaje_cargas WHERE empresa_id = $1 AND id = ANY($2::uuid[]) AND consumido_at IS NULL`,
      [session.companyId, expired.rows.map((row) => row.id)],
    );
  } catch (error) {
    console.warn("[Starlim Messages] No se pudieron limpiar cargas vencidas", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function prepareMessageAttachmentUpload(
  session: AuthSession,
  input: Record<string, unknown>,
) {
  const validation = validateMessageAttachment(parseMetadata(input));
  if (!validation.data) throw new ApiError(400, validation.error || "Archivo invalido");
  const metadata = validation.data;

  await cleanupExpiredUploads(session);
  const pending = await queryWithCompanyContext<{ total: string }>(
    session.companyId,
    `
      SELECT COUNT(*)::text AS total
      FROM mensaje_cargas
      WHERE empresa_id = $1
        AND usuario = $2
        AND consumido_at IS NULL
        AND expira_at > NOW()
    `,
    [session.companyId, session.username],
  );
  if (Number(pending.rows[0]?.total ?? 0) >= MAX_PENDING_UPLOADS) {
    throw new ApiError(429, "Hay demasiadas cargas pendientes. Espera unos minutos e intenta otra vez");
  }

  const uploadId = randomUUID();
  const baseName = sanitizeStorageName(metadata.fileName.replace(/\.[^.]+$/, "")) || "archivo";
  const objectPath = `mensajes/empresa_${session.companyId}/${uploadId}_${baseName}.${metadata.extension}`;
  const signed = await createSignedStorageUpload(objectPath);

  await queryWithCompanyContext(
    session.companyId,
    `
      INSERT INTO mensaje_cargas (
        id, empresa_id, usuario, bucket, objeto_path,
        nombre_original, tipo_mime, tamano_bytes
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      uploadId,
      session.companyId,
      session.username,
      signed.bucket,
      signed.path,
      metadata.fileName,
      metadata.contentType,
      metadata.size,
    ],
  );

  return {
    id: uploadId,
    bucket: signed.bucket,
    path: signed.path,
    token: signed.token,
    contentType: metadata.contentType,
    expiresInSeconds: 2 * 60 * 60,
  };
}

export async function attachPreparedMessageUploads(
  client: MessageDbClient,
  session: AuthSession,
  messageId: number,
  uploadIds: string[],
) {
  if (!uploadIds.length) return;

  const uploads = await client.query<PreparedUploadRow>(
    `
      SELECT id::text, bucket, objeto_path, nombre_original, tipo_mime, tamano_bytes
      FROM mensaje_cargas
      WHERE empresa_id = $1
        AND usuario = $2
        AND id = ANY($3::uuid[])
        AND consumido_at IS NULL
        AND expira_at > NOW()
      FOR UPDATE
    `,
    [session.companyId, session.username, uploadIds],
  );
  if (uploads.rows.length !== uploadIds.length) {
    throw new ApiError(400, "Uno de los adjuntos vencio o no pertenece a tu usuario");
  }

  for (const upload of uploads.rows) {
    const object = await storageObjectInfo(upload.bucket, upload.objeto_path);
    if (object.size !== Number(upload.tamano_bytes)) {
      throw new ApiError(400, `La carga de ${upload.nombre_original} quedo incompleta`);
    }

    await client.query(
      `
        INSERT INTO mensaje_adjuntos (
          mensaje_id, empresa_id, carga_id, bucket, objeto_path,
          nombre_original, tipo_mime, tamano_bytes
        )
        VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8)
      `,
      [
        messageId,
        session.companyId,
        upload.id,
        upload.bucket,
        upload.objeto_path,
        upload.nombre_original,
        upload.tipo_mime,
        Number(upload.tamano_bytes),
      ],
    );
  }

  await client.query(
    `
      UPDATE mensaje_cargas
      SET consumido_at = NOW()
      WHERE empresa_id = $1 AND usuario = $2 AND id = ANY($3::uuid[])
    `,
    [session.companyId, session.username, uploadIds],
  );
}

export async function listMessageAttachments(session: AuthSession, messageIds: number[]) {
  const result = new Map<number, MessageAttachment[]>();
  if (!messageIds.length) return result;

  let attachments: { rows: Array<{
    id: number;
    mensaje_id: number;
    nombre_original: string;
    tipo_mime: string;
    tamano_bytes: string | number;
  }> };
  try {
    attachments = await queryWithCompanyContext<{
      id: number;
      mensaje_id: number;
      nombre_original: string;
      tipo_mime: string;
      tamano_bytes: string | number;
    }>(
      session.companyId,
      `
        SELECT ma.id, ma.mensaje_id, ma.nombre_original, ma.tipo_mime, ma.tamano_bytes
        FROM mensaje_adjuntos ma
        JOIN mensajes m ON m.id = ma.mensaje_id AND m.empresa_id = ma.empresa_id
        WHERE ma.empresa_id = $1
          AND ma.mensaje_id = ANY($2::bigint[])
          AND (m.de = $3 OR m.para = $3)
        ORDER BY ma.creado_at ASC, ma.id ASC
      `,
      [session.companyId, messageIds, session.username],
    );
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "42P01") return result;
    throw error;
  }

  for (const row of attachments.rows) {
    const attachment: MessageAttachment = {
      id: Number(row.id),
      messageId: Number(row.mensaje_id),
      fileName: row.nombre_original,
      contentType: row.tipo_mime,
      size: Number(row.tamano_bytes),
      downloadUrl: attachmentDownloadUrl(Number(row.mensaje_id), Number(row.id)),
    };
    result.set(attachment.messageId, [...(result.get(attachment.messageId) ?? []), attachment]);
  }

  return result;
}

export async function getMessageAttachment(
  session: AuthSession,
  messageId: number,
  attachmentId: number,
) {
  const result = await queryWithCompanyContext<{
    bucket: string;
    objeto_path: string;
    nombre_original: string;
  }>(
    session.companyId,
    `
      SELECT ma.bucket, ma.objeto_path, ma.nombre_original
      FROM mensaje_adjuntos ma
      JOIN mensajes m ON m.id = ma.mensaje_id AND m.empresa_id = ma.empresa_id
      WHERE ma.id = $1
        AND ma.mensaje_id = $2
        AND ma.empresa_id = $3
        AND (m.de = $4 OR m.para = $4)
      LIMIT 1
    `,
    [attachmentId, messageId, session.companyId, session.username],
  );
  if (!result.rows[0]) throw new ApiError(404, "Adjunto no encontrado o no autorizado");
  return result.rows[0];
}
