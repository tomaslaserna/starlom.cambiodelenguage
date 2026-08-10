-- Una imagen por producto. El archivo vive en un bucket publico dedicado
-- (miniaturas de catalogo, no sensibles); solo se guarda el path aca.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Bucket publico para imagenes de producto. La lectura es publica (miniaturas
-- sin firmar); la subida sigue requiriendo URL firmada / service role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
