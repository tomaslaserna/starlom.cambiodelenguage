-- Reglas iniciales de presentación acordadas para el catálogo actual de Starlim.
-- Papelería y Artículos permanecen sin cambios hasta su revisión manual.
UPDATE public.products
SET presentation_units = CASE upper(trim(category))
      WHEN 'TEXTIL' THEN 12
      WHEN 'LIMPIEZA' THEN 6
    END,
    updated_at = now()
WHERE empresa_id = 1
  AND upper(trim(category)) IN ('TEXTIL', 'LIMPIEZA')
  AND presentation_units IS DISTINCT FROM CASE upper(trim(category))
        WHEN 'TEXTIL' THEN 12
        WHEN 'LIMPIEZA' THEN 6
      END;
