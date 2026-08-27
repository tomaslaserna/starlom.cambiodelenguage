-- Lista 2 is the commercial anchor. Category margins define its ideal price
-- over cost; every other list is a percentage variation of that anchor.
WITH anchor_margins(code, multiplier) AS (
  VALUES
    ('ART', 1.70::numeric),
    ('DES', 1.60::numeric),
    ('LIM', 1.70::numeric),
    ('MAR', 1.30::numeric),
    ('PAP', 1.70::numeric),
    ('TEX', 1.70::numeric)
)
UPDATE public.margenes m
SET precio_0 = a.multiplier * 0.80,
    precio_1 = a.multiplier,
    precio_2 = a.multiplier,
    precio_3 = a.multiplier * 1.15,
    margen_minorista = a.multiplier * 1.45,
    updated_at = now()
FROM anchor_margins a
WHERE m.empresa_id = 1 AND m.codigo = a.code;

-- Disable the accidental duplicate list and define the commercial hierarchy.
UPDATE public.listas_precio
SET activa = 0, updated_at = now()
WHERE empresa_id = 1 AND id = 9;

UPDATE public.listas_precio
SET derivation_type = 'costo', parent_list_id = NULL, percentage = 0,
    nombre = 'L2 - ANCLA', updated_at = now()
WHERE empresa_id = 1 AND id = 7;

UPDATE public.listas_precio
SET derivation_type = 'lista', parent_list_id = 7, percentage = -20,
    nombre = 'L0 - EXCLUSIVO', updated_at = now()
WHERE empresa_id = 1 AND id = 2;

UPDATE public.listas_precio
SET derivation_type = 'lista', parent_list_id = 7, percentage = -10,
    nombre = 'L1 - VOLUMEN', updated_at = now()
WHERE empresa_id = 1 AND id = 3;

UPDATE public.listas_precio
SET derivation_type = 'lista', parent_list_id = 7, percentage = 15,
    nombre = 'L3 - 30 DÍAS', updated_at = now()
WHERE empresa_id = 1 AND id = 8;

UPDATE public.listas_precio
SET derivation_type = 'lista', parent_list_id = 7, percentage = 45,
    nombre = 'MINORISTA', updated_at = now()
WHERE empresa_id = 1 AND id = 5;

DELETE FROM public.margenes_listas
WHERE empresa_id = 1 AND lista_id = 9;

INSERT INTO public.margenes_listas (codigo, lista_id, multiplicador, empresa_id)
SELECT m.codigo, lp.id,
  round((m.precio_1 * CASE lp.id
    WHEN 2 THEN 0.80
    WHEN 3 THEN 0.90
    WHEN 7 THEN 1.00
    WHEN 8 THEN 1.15
    WHEN 5 THEN 1.45
    ELSE 1.00
  END)::numeric, 6), 1
FROM public.margenes m
JOIN public.listas_precio lp ON lp.empresa_id = m.empresa_id
WHERE m.empresa_id = 1 AND lp.id IN (2, 3, 5, 7, 8)
ON CONFLICT (codigo, lista_id) DO UPDATE SET
  multiplicador = excluded.multiplicador,
  updated_at = now();
