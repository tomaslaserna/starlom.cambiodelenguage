# Imagen de producto

**Fecha:** 2026-07-28
**Estado:** aprobado (diseño)

## Objetivo

Una imagen por producto, que se pueda adjuntar tanto al **crear** el producto
como **inline** desde la columna de imagen en la Lista de precios, y que se
muestre como miniatura.

## Almacenamiento

- Migración: columna `image_path TEXT` (nullable) en `products`.
- Bucket **`product-images`** **público** (miniaturas rápidas sin firmar por
  fila; las fotos de producto no son sensibles). `file_size_limit` 5 MB,
  `allowed_mime_types` = JPG/PNG/WEBP/GIF.
- Ruta del objeto por UUID: `empresa_<id>/<uuid>.<ext>` (funciona antes de que el
  producto exista, para el alta).
- URL pública: `${SUPABASE_URL}/storage/v1/object/public/product-images/<path>`.

## Subida (mismo pipeline que Banco)

- `POST /api/products/image/sign` — body `{fileName, mime, size}` → valida (imagen,
  ≤5 MB) y devuelve `{bucket, path, token}` (URL firmada de subida al bucket
  `product-images`). El navegador sube directo a Supabase.
- **Alta (`/prices/new`)**: el form pasa a client; si elegís imagen, se sube
  antes de crear y `createCatalogProduct` guarda `image_path`.
- **Inline (Lista de precios)**: cada fila tiene una celda de imagen (client
  component): miniatura o "+"; permite subir/**reemplazar**/**quitar**.
  - `POST /api/products/[id]/image` — body `{path}` → verifica el objeto, borra
    la imagen anterior si había, guarda `image_path`.
  - `DELETE /api/products/[id]/image` → borra objeto + `image_path = NULL`.

## Storage lib

- `storage.ts`: permitir el bucket `product-images` (junto a `uploads` y `bank`).
  `createSignedStorageUpload(path, bucket)` ya acepta bucket. Agregar helper
  `publicProductImageUrl(path)`.

## Mostrar

- `listSalePrices` devuelve `imageUrl` (URL pública o null).
- Lista de precios: nueva columna **"Imagen"** (primera) con la miniatura o un
  "+" para subir.

## Permisos

- Ver = todo el staff.
- Subir/quitar = quien puede crear/editar productos (`PRODUCTS_CREATE_PERMISSION`).

## Validación (pura, testeable)

- `lib/product-image.ts`: `validateProductImage({name, mime, size})` (extensión
  de imagen permitida, mime coherente, tamaño ≤ 5 MB) + `MIME_BY_EXT`,
  `MAX_IMAGE_BYTES`. Unit test con `node --test`.

## Testing

- Unitario: `validateProductImage` (ok, extensión inválida, muy grande, mime).
- DB/flujo: alta con imagen, subir/reemplazar/quitar inline; verificación
  autenticada manual + `next build`.

## Fuera de alcance

Múltiples imágenes por producto, galería, recorte/edición.
