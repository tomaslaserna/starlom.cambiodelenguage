-- Normaliza la marca visible de la empresa inicial.
-- No cambia slug ni identificadores tecnicos.

UPDATE public.empresas
SET nombre = 'Starlim'
WHERE id = 1
  AND nombre <> 'Starlim';
