import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-response";
import { isAdminRole, type AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import {
  BANK_BUCKET,
  createSignedStorageUpload,
  createSignedStorageUrl,
  removeStorageObjects,
  sanitizeStorageName,
  storageObjectInfo,
} from "@/lib/storage";
import { type BankScope, quotaForScope, validateBankFile, wouldExceedQuota } from "@/lib/bank";

const READ = { cache: false } as const;

export type BankFolder = { id: number; name: string; createdAt: string };
export type BankFile = {
  id: number;
  name: string;
  mime: string;
  sizeBytes: number;
  folderId: number | null;
  createdAt: string;
  createdBy: string | null;
};
export type BankListing = {
  scope: BankScope;
  canWrite: boolean;
  usedBytes: number;
  quotaBytes: number;
  folders: BankFolder[];
  files: BankFile[];
};

function parseScope(value: unknown): BankScope {
  if (value === "personal" || value === "shared") return value;
  throw new ApiError(400, "Ambito invalido");
}

// Writing to the shared company area is restricted to admin roles. The personal
// area is always writable by its own owner (the current user).
function canWrite(session: AuthSession, scope: BankScope): boolean {
  return scope === "shared" ? isAdminRole(session.role) : true;
}

function assertCanWrite(session: AuthSession, scope: BankScope) {
  if (!canWrite(session, scope)) {
    throw new ApiError(403, "Solo el jefe o un administrador puede modificar el banco de la empresa");
  }
}

// SQL fragment + params tail that scopes a query to the caller's personal bank or
// to the company-shared bank. $1 is always empresa_id.
function scopeClause(session: AuthSession, scope: BankScope): { clause: string; params: unknown[] } {
  if (scope === "personal") {
    return { clause: "scope = 'personal' AND owner_username = $2", params: [session.companyId, session.username] };
  }
  return { clause: "scope = 'shared' AND owner_username IS NULL", params: [session.companyId] };
}

async function usedBytes(session: AuthSession, scope: BankScope): Promise<number> {
  const { clause, params } = scopeClause(session, scope);
  const result = await queryWithCompanyContext<{ used: string }>(
    session.companyId,
    `SELECT COALESCE(SUM(size_bytes), 0)::text AS used FROM bank_files WHERE empresa_id = $1 AND ${clause}`,
    params,
    READ,
  );
  return Number(result.rows[0]?.used ?? 0);
}

export async function listBank(session: AuthSession, scopeInput: unknown): Promise<BankListing> {
  const scope = parseScope(scopeInput);
  const { clause, params } = scopeClause(session, scope);

  const [folders, files, used] = await Promise.all([
    queryWithCompanyContext<{ id: string; name: string; created_at: string }>(
      session.companyId,
      `SELECT id::text, name, created_at FROM bank_folders WHERE empresa_id = $1 AND ${clause} ORDER BY name ASC`,
      params,
      READ,
    ),
    queryWithCompanyContext<{
      id: string;
      name: string;
      mime: string;
      size_bytes: string;
      folder_id: string | null;
      created_at: string;
      created_by: string | null;
    }>(
      session.companyId,
      `SELECT id::text, name, mime, size_bytes, folder_id::text, created_at, created_by
       FROM bank_files WHERE empresa_id = $1 AND ${clause}
       ORDER BY name ASC`,
      params,
      READ,
    ),
    usedBytes(session, scope),
  ]);

  return {
    scope,
    canWrite: canWrite(session, scope),
    usedBytes: used,
    quotaBytes: quotaForScope(scope),
    folders: folders.rows.map((row) => ({ id: Number(row.id), name: row.name, createdAt: row.created_at })),
    files: files.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      mime: row.mime,
      sizeBytes: Number(row.size_bytes),
      folderId: row.folder_id === null ? null : Number(row.folder_id),
      createdAt: row.created_at,
      createdBy: row.created_by,
    })),
  };
}

export async function createBankFolder(session: AuthSession, scopeInput: unknown, nameInput: unknown): Promise<BankFolder> {
  const scope = parseScope(scopeInput);
  assertCanWrite(session, scope);
  const name = String(nameInput ?? "").trim().slice(0, 80);
  if (name.length < 1) throw new ApiError(400, "Poné un nombre para la carpeta");

  const owner = scope === "personal" ? session.username : null;
  const result = await queryWithCompanyContext<{ id: string; created_at: string }>(
    session.companyId,
    `INSERT INTO bank_folders (empresa_id, scope, owner_username, name, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text, created_at`,
    [session.companyId, scope, owner, name, session.username],
  );
  return { id: Number(result.rows[0].id), name, createdAt: result.rows[0].created_at };
}

async function assertFolderInScope(session: AuthSession, scope: BankScope, folderId: number) {
  const { clause, params } = scopeClause(session, scope);
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `SELECT id::text FROM bank_folders WHERE empresa_id = $1 AND ${clause} AND id = $${params.length + 1}`,
    [...params, folderId],
    READ,
  );
  if (!result.rows[0]) throw new ApiError(404, "La carpeta no existe");
}

export async function prepareBankUpload(
  session: AuthSession,
  input: { scope?: unknown; folderId?: unknown; fileName?: unknown; mime?: unknown; size?: unknown },
) {
  const scope = parseScope(input.scope);
  assertCanWrite(session, scope);

  const validation = validateBankFile({
    name: String(input.fileName ?? ""),
    mime: String(input.mime ?? ""),
    size: Number(input.size ?? 0),
  });
  if (!validation.data) throw new ApiError(400, validation.error);
  const metadata = validation.data;

  const folderId = input.folderId == null || input.folderId === "" ? null : Number(input.folderId);
  if (folderId !== null) {
    if (!Number.isInteger(folderId)) throw new ApiError(400, "Carpeta invalida");
    await assertFolderInScope(session, scope, folderId);
  }

  const used = await usedBytes(session, scope);
  if (wouldExceedQuota(used, metadata.size, scope)) {
    throw new ApiError(413, "No hay espacio suficiente en el banco para este archivo");
  }

  const uploadId = randomUUID();
  const owner = scope === "personal" ? session.username : null;
  const baseName = sanitizeStorageName(String(input.fileName).replace(/\.[^.]+$/, "")) || "archivo";
  const objectPath =
    scope === "personal"
      ? `personal/empresa_${session.companyId}/${sanitizeStorageName(session.username)}/${uploadId}_${baseName}.${metadata.extension}`
      : `shared/empresa_${session.companyId}/${uploadId}_${baseName}.${metadata.extension}`;

  const signed = await createSignedStorageUpload(objectPath, BANK_BUCKET);

  await queryWithCompanyContext(
    session.companyId,
    `INSERT INTO bank_uploads (id, empresa_id, scope, owner_username, folder_id, bucket, object_path, nombre_original, tipo_mime, created_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [uploadId, session.companyId, scope, owner, folderId, signed.bucket, signed.path, String(input.fileName), metadata.contentType, session.username],
  );

  return {
    uploadId,
    bucket: signed.bucket,
    path: signed.path,
    token: signed.token,
    contentType: metadata.contentType,
  };
}

export async function confirmBankUpload(session: AuthSession, uploadIdInput: unknown): Promise<BankFile> {
  const uploadId = String(uploadIdInput ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new ApiError(400, "Carga invalida");

  const file = await withCompanyContext(session.companyId, async (client) => {
    const pending = await client.query<{
      scope: BankScope;
      owner_username: string | null;
      folder_id: string | null;
      bucket: string;
      object_path: string;
      nombre_original: string;
      tipo_mime: string;
    }>(
      `SELECT scope, owner_username, folder_id::text, bucket, object_path, nombre_original, tipo_mime
       FROM bank_uploads
       WHERE empresa_id = $1 AND id = $2::uuid AND consumido_at IS NULL AND expira_at > NOW()
       FOR UPDATE`,
      [session.companyId, uploadId],
    );
    const row = pending.rows[0];
    if (!row) throw new ApiError(404, "La carga vencio o no existe");

    // Re-check the caller is allowed to finalize this upload.
    assertCanWrite(session, row.scope);
    if (row.scope === "personal" && row.owner_username !== session.username) {
      throw new ApiError(403, "La carga no pertenece a tu usuario");
    }

    const object = await storageObjectInfo(row.bucket, row.object_path);
    if (!object.size) throw new ApiError(400, "El archivo no termino de subirse");

    const used = await client
      .query<{ used: string }>(
        row.scope === "personal"
          ? `SELECT COALESCE(SUM(size_bytes),0)::text AS used FROM bank_files WHERE empresa_id=$1 AND scope='personal' AND owner_username=$2`
          : `SELECT COALESCE(SUM(size_bytes),0)::text AS used FROM bank_files WHERE empresa_id=$1 AND scope='shared' AND owner_username IS NULL`,
        row.scope === "personal" ? [session.companyId, session.username] : [session.companyId],
      )
      .then((result) => Number(result.rows[0]?.used ?? 0));
    if (wouldExceedQuota(used, object.size, row.scope)) {
      throw new ApiError(413, "No hay espacio suficiente en el banco para este archivo");
    }

    const inserted = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO bank_files (empresa_id, scope, owner_username, folder_id, name, object_path, mime, size_bytes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id::text, created_at`,
      [
        session.companyId,
        row.scope,
        row.owner_username,
        row.folder_id === null ? null : Number(row.folder_id),
        row.nombre_original,
        row.object_path,
        object.contentType || row.tipo_mime,
        object.size,
        session.username,
      ],
    );

    await client.query(`UPDATE bank_uploads SET consumido_at = NOW() WHERE empresa_id = $1 AND id = $2::uuid`, [
      session.companyId,
      uploadId,
    ]);

    return {
      id: Number(inserted.rows[0].id),
      name: row.nombre_original,
      mime: object.contentType || row.tipo_mime,
      sizeBytes: object.size,
      folderId: row.folder_id === null ? null : Number(row.folder_id),
      createdAt: inserted.rows[0].created_at,
      createdBy: session.username,
    } satisfies BankFile;
  });

  return file;
}

async function fetchFileForWrite(session: AuthSession, fileId: number) {
  const result = await queryWithCompanyContext<{ scope: BankScope; owner_username: string | null; object_path: string }>(
    session.companyId,
    `SELECT scope, owner_username, object_path FROM bank_files WHERE empresa_id = $1 AND id = $2`,
    [session.companyId, fileId],
    READ,
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "El archivo no existe");
  if (row.scope === "personal" && row.owner_username !== session.username) {
    throw new ApiError(403, "El archivo no pertenece a tu usuario");
  }
  if (row.scope === "shared") assertCanWrite(session, "shared");
  return row;
}

export async function deleteBankFile(session: AuthSession, fileIdInput: unknown) {
  const fileId = Number(fileIdInput);
  if (!Number.isInteger(fileId)) throw new ApiError(400, "Archivo invalido");
  const row = await fetchFileForWrite(session, fileId);
  await removeStorageObjects(BANK_BUCKET, [row.object_path]);
  await queryWithCompanyContext(session.companyId, `DELETE FROM bank_files WHERE empresa_id = $1 AND id = $2`, [
    session.companyId,
    fileId,
  ]);
}

export async function deleteBankFolder(session: AuthSession, folderIdInput: unknown) {
  const folderId = Number(folderIdInput);
  if (!Number.isInteger(folderId)) throw new ApiError(400, "Carpeta invalida");

  const folder = await queryWithCompanyContext<{ scope: BankScope; owner_username: string | null }>(
    session.companyId,
    `SELECT scope, owner_username FROM bank_folders WHERE empresa_id = $1 AND id = $2`,
    [session.companyId, folderId],
    READ,
  );
  const row = folder.rows[0];
  if (!row) throw new ApiError(404, "La carpeta no existe");
  if (row.scope === "personal" && row.owner_username !== session.username) {
    throw new ApiError(403, "La carpeta no pertenece a tu usuario");
  }
  if (row.scope === "shared") assertCanWrite(session, "shared");

  const files = await queryWithCompanyContext<{ object_path: string }>(
    session.companyId,
    `SELECT object_path FROM bank_files WHERE empresa_id = $1 AND folder_id = $2`,
    [session.companyId, folderId],
    READ,
  );
  if (files.rows.length) {
    await removeStorageObjects(BANK_BUCKET, files.rows.map((file) => file.object_path));
  }
  // bank_files rows cascade-delete via the folder_id FK.
  await queryWithCompanyContext(session.companyId, `DELETE FROM bank_folders WHERE empresa_id = $1 AND id = $2`, [
    session.companyId,
    folderId,
  ]);
}

export async function signBankFile(session: AuthSession, fileIdInput: unknown, download = false): Promise<string> {
  const fileId = Number(fileIdInput);
  if (!Number.isInteger(fileId)) throw new ApiError(400, "Archivo invalido");

  const result = await queryWithCompanyContext<{
    scope: BankScope;
    owner_username: string | null;
    object_path: string;
    name: string;
  }>(
    session.companyId,
    `SELECT scope, owner_username, object_path, name FROM bank_files WHERE empresa_id = $1 AND id = $2`,
    [session.companyId, fileId],
    READ,
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "El archivo no existe");
  // View permission: personal is private to its owner; shared is visible to any staff.
  if (row.scope === "personal" && row.owner_username !== session.username) {
    throw new ApiError(403, "El archivo no pertenece a tu usuario");
  }

  return createSignedStorageUrl(BANK_BUCKET, row.object_path, 300, download ? row.name : undefined);
}
