# Banco — almacenamiento de archivos (personal + compartido)

**Fecha:** 2026-07-26
**Estado:** aprobado (diseño)

## Problema / objetivo

El staff necesita un lugar dentro del ERP para guardar archivos relevantes a su
rol (listas de precios, catálogos, fotos de productos, manuales de venta, notas).
Hoy no existe. Se agrega un apartado **"Banco"** tipo Drive con dos espacios:

- **Personal:** privado de cada usuario; solo esa persona ve y administra.
- **Compartido (empresa):** lo ve todo el staff; suben/borran solo jefe/admin.

## Decisiones acordadas

- Modelo **mixto**: personal + compartido.
- Zona compartida: **ver = todo el staff**, **subir/borrar = solo jefe/admin**.
- Cuota **personal = 500 MB por usuario**.
- Cuota **compartida = 2 GB** para toda la empresa.
- **Máx. por archivo = 25 MB.**
- Tipos permitidos: PDF, imágenes (JPG/PNG/WEBP/GIF), Office (XLSX/XLS/DOCX/DOC),
  CSV, TXT.
- Carpetas de **un solo nivel** en el v1 (sin anidado profundo).
- Ítem "Banco" en la sección **Inicio** del menú, visible para todo el staff.

## Reutilización de infraestructura

El pipeline de subida replica el de adjuntos de mensajes (`lib/storage.ts` +
`lib/message-attachments.ts`):

1. `POST /api/bank/uploads/sign` → valida permiso y cuota proyectada; crea una
   fila de carga pendiente y devuelve una **URL firmada** de subida.
2. El navegador sube el archivo **directo a Supabase** (esquiva el límite de body
   de Vercel).
3. `POST /api/bank/files` → `storageObjectInfo` para leer el tamaño real,
   re-valida la cuota, mueve la carga a definitiva (`bank_files`).

Helpers reutilizados: `createSignedStorageUpload`, `storageObjectInfo`,
`createSignedStorageUrl`, `removeStorageObjects`, `sanitizeStorageName`.

## Storage

- Bucket **privado dedicado `bank`** (separado de `uploads`), `file_size_limit`
  26214400 (25 MB) y `allowed_mime_types` = el set listado arriba.
- Ruta del objeto:
  - Personal: `personal/<username>/<uuid>_<nombre-sanitizado>.<ext>`
  - Compartido: `shared/<empresa_id>/<uuid>_<nombre-sanitizado>.<ext>`
- Ver/descargar mediante **URL firmada temporal (300 s)**; borrar elimina el
  objeto y su fila.

## Datos (migración)

```
bank_folders (
  id            BIGSERIAL PK,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL CHECK (scope IN ('personal','shared')),
  owner_username TEXT,           -- NULL cuando scope='shared'
  name          TEXT NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

bank_files (
  id            BIGSERIAL PK,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL CHECK (scope IN ('personal','shared')),
  owner_username TEXT,           -- NULL cuando scope='shared'
  folder_id     BIGINT REFERENCES bank_folders(id) ON DELETE CASCADE,  -- NULL = raíz
  name          TEXT NOT NULL,
  object_path   TEXT NOT NULL UNIQUE,
  mime          TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

bank_uploads (  -- staging de cargas pendientes, análogo a mensaje_cargas
  id            UUID PK,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL,
  owner_username TEXT,
  folder_id     BIGINT,
  bucket        TEXT NOT NULL,
  object_path   TEXT NOT NULL UNIQUE,
  nombre_original TEXT NOT NULL,
  created_by    TEXT,
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
  consumido_at  TIMESTAMPTZ
)
```

- RLS por `empresa_id` (mismo patrón guardado por `starlim_app` que el resto).
- Índices: `(empresa_id, scope, owner_username)` en folders y files.
- Cuota:
  - personal = `SUM(size_bytes)` where `scope='personal' AND owner_username=$user`.
  - compartida = `SUM(size_bytes)` where `scope='shared'`.

## Lógica

### `lib/bank.ts` (pura, testeable con `node --test`)
- Constantes: `PERSONAL_QUOTA_BYTES` (500 MB), `SHARED_QUOTA_BYTES` (2 GB),
  `MAX_FILE_BYTES` (25 MB), `ALLOWED_MIME` (set), `MIME_BY_EXTENSION`.
- `assertAllowedFile(name, mime)` → valida extensión/mime permitidos.
- `remainingQuota(usedBytes, scope)` y `wouldExceedQuota(usedBytes, addBytes, scope)`.
- `formatBytes(n)` para la UI.

### `lib/bank-store.ts` (servidor: DB + storage)
- `listBank(session, scope)` → carpetas + archivos + uso de cuota del scope.
- `createBankFolder(session, scope, name)` (valida rol en shared).
- `prepareBankUpload(session, {scope, folderId, fileName, mime, size})` → valida
  rol/cuota/tipo, `createSignedStorageUpload`, inserta `bank_uploads`.
- `confirmBankUpload(session, uploadId)` → `storageObjectInfo`, re-valida cuota,
  inserta `bank_files`, marca la carga consumida.
- `deleteBankFile(session, fileId)` → valida permiso, `removeStorageObjects`,
  borra fila.
- `signBankFile(session, fileId)` → `createSignedStorageUrl` para ver/descargar.
- Regla de escritura en `shared`: solo roles de administración
  (`isStaffRole`/rol jefe-admin; se resuelve con los helpers de `lib/auth`).

## API

- `POST /api/bank/uploads/sign` — body `{scope, folderId?, fileName, mime, size}`
  → `{ uploadId, bucket, path, token }`.
- `POST /api/bank/files` — body `{ uploadId }` → confirma y devuelve el archivo.
- `DELETE /api/bank/files/[id]` — borra archivo.
- `GET /api/bank/files/[id]` — devuelve URL firmada (o redirige) para ver/descargar.
- `POST /api/bank/folders` — crea carpeta.
- `DELETE /api/bank/folders/[id]` — borra carpeta (y su contenido en cascada).

Todas con `requireApiSession`; las de `shared` con escritura validan rol.

## UI (`/bank`)

- Server component carga el scope inicial (personal) con `listBank`.
- Client component con dos pestañas **Mi banco** / **Empresa**:
  - Barra de uso ("320 de 500 MB").
  - Lista de carpetas (chips) + archivos (nombre, tamaño, fecha).
  - Acciones por archivo: **Ver/Descargar** (URL firmada), **Borrar** (según permiso).
  - Botones **Subir** y **Nueva carpeta** (en `shared` solo visibles para jefe/admin).
  - Subida: sign → PUT directo a Supabase → confirm; barra de progreso simple.

## Menú

Agregar a la sección **Inicio** de `lib/navigation.ts`:
`{ href: "/bank", label: "Banco", active: "bank" }`, y sumar `"bank"` al type de
`active`. Sin permiso especial (todo el staff ve; el control fino es por scope/rol
en la capa de datos).

## Testing

- **Unitario (`node --test`)**: `assertAllowedFile`, `wouldExceedQuota`,
  `remainingQuota`, `formatBytes`.
- **DB/flujo real**: verificación autenticada manual (subir/ver/borrar en personal
  y compartido; cuota; permisos de shared para no-admin).

## Despliegue

- Aplicar la migración (tablas + bucket `bank`) a Supabase (durante la
  implementación, con aviso, vía acceso directo a la DB).
- Push a `main` → deploy automático de Vercel.

## Fuera de alcance (v1)

Carpetas anidadas profundas, versionado, compartir entre usuarios puntuales,
previsualización embebida, mover/renombrar archivos.
